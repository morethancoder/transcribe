//! Whisper models: the catalogue, which one is chosen, and fetching on demand.
//!
//! A port of `src/lib/server/model.ts`. There are two *roles* rather than two
//! models — transcription runs whatever the user picked, and translation runs
//! that same model when it can. The split exists because `large-v3-turbo`, the
//! default, is transcription-only: it silently ignores whisper's translate flag
//! and hands back the source language, so translating with turbo selected has
//! to fetch a multilingual model alongside it. Pick anything else and the
//! second download never happens.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

use super::{EngineError, Result};

const HF: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// Two *roles*, not two fixed models: transcription runs whichever model the
/// user picked, and translation runs that same model when it can translate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelKind {
    Transcribe,
    Translate,
}

/// The catalogue, mirroring `src/lib/models.ts`. Both copies have to agree on
/// file names and byte counts, so a change to one belongs in the other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelId {
    Tiny,
    Base,
    Small,
    Medium,
    #[serde(rename = "large-v3-turbo")]
    LargeV3Turbo,
    #[serde(rename = "large-v3")]
    LargeV3,
}

/// What transcrape has always used, and still the right default on a desktop.
pub const DEFAULT_MODEL: ModelId = ModelId::LargeV3Turbo;

/// Filled in when the chosen model can't translate — the smallest model that
/// translates well enough to be worth the download.
pub const FALLBACK_TRANSLATE_MODEL: ModelId = ModelId::Medium;

impl ModelId {
    pub const ALL: [ModelId; 6] = [
        ModelId::Tiny,
        ModelId::Base,
        ModelId::Small,
        ModelId::Medium,
        ModelId::LargeV3Turbo,
        ModelId::LargeV3,
    ];

    /// The `.bin` name, which is also its name on Hugging Face.
    pub fn file_name(self) -> &'static str {
        match self {
            Self::Tiny => "ggml-tiny-q5_1.bin",
            Self::Base => "ggml-base-q5_1.bin",
            Self::Small => "ggml-small-q5_1.bin",
            Self::Medium => "ggml-medium-q5_0.bin",
            Self::LargeV3Turbo => "ggml-large-v3-turbo-q5_0.bin",
            Self::LargeV3 => "ggml-large-v3-q5_0.bin",
        }
    }

    /// Real `content-length` from Hugging Face. The frontend catalogue carries
    /// its own copy for the picker; this one exists so the parity test can hold
    /// the two to the same numbers.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn bytes(self) -> u64 {
        match self {
            Self::Tiny => 32_152_673,
            Self::Base => 59_707_625,
            Self::Small => 190_085_487,
            Self::Medium => 539_212_467,
            Self::LargeV3Turbo => 574_041_195,
            Self::LargeV3 => 1_081_140_203,
        }
    }

    /// Whether this model can translate to English.
    ///
    /// `large-v3-turbo` cannot: it silently ignores whisper's translate flag and
    /// returns the source language. Every other model here can, which means
    /// choosing one of them makes translation free — no second download.
    pub fn translates(self) -> bool {
        !matches!(self, Self::LargeV3Turbo)
    }

    /// Which model translates, given the one chosen for transcription.
    pub fn translate_model(self) -> ModelId {
        if self.translates() {
            self
        } else {
            FALLBACK_TRANSLATE_MODEL
        }
    }

    pub fn url(self) -> String {
        format!("{HF}/{}", self.file_name())
    }

    /// The id as the frontend spells it, matching `ModelId` in `$lib/models`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tiny => "tiny",
            Self::Base => "base",
            Self::Small => "small",
            Self::Medium => "medium",
            Self::LargeV3Turbo => "large-v3-turbo",
            Self::LargeV3 => "large-v3",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        ModelId::ALL.into_iter().find(|id| id.as_str() == value)
    }
}

/// Read back the persisted choice, falling back to the default. Parsed by hand
/// rather than with serde_json's derive so a corrupt or half-written file is
/// simply ignored instead of failing a launch.
fn load_selection(dir: &Path) -> ModelId {
    let Ok(text) = std::fs::read_to_string(dir.join("selected.json")) else {
        return DEFAULT_MODEL;
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("model")?.as_str().map(str::to_owned))
        .and_then(|s| ModelId::from_str(&s))
        .unwrap_or(DEFAULT_MODEL)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Missing,
    Downloading,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelState {
    pub status: Status,
    pub received: u64,
    pub total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl ModelState {
    fn missing() -> Self {
        Self { status: Status::Missing, received: 0, total: 0, message: None }
    }
}

/// Where the models live, which one is chosen, and the progress of any
/// download in flight.
pub struct Models {
    dir: PathBuf,
    /// Keyed by model, not by role: two roles can resolve to the same file, and
    /// switching models mid-download shouldn't strand that progress under a
    /// role that has stopped pointing at it.
    states: Mutex<HashMap<ModelId, ModelState>>,
    selected: Mutex<ModelId>,
    /// One download per model at a time. The picker's polling and a run that
    /// needs the same model can both call `ensure`; without this they would
    /// append to the same partial file at once.
    locks: Mutex<HashMap<ModelId, Arc<tokio::sync::Mutex<()>>>>,
}

impl Models {
    pub fn new(dir: PathBuf) -> Self {
        let selected = load_selection(&dir);
        Self {
            dir,
            states: Mutex::new(HashMap::new()),
            selected: Mutex::new(selected),
            locks: Mutex::new(HashMap::new()),
        }
    }

    /// Which model is currently doing the transcribing.
    pub fn selected(&self) -> ModelId {
        *self.selected.lock().unwrap()
    }

    /// Change it. Downloads are lazy, so this is only a note of intent.
    pub fn select(&self, id: ModelId) {
        *self.selected.lock().unwrap() = id;
        let file = self.dir.join("selected.json");
        let _ = std::fs::create_dir_all(&self.dir);
        // A read-only install just means the choice won't survive a restart.
        let _ = std::fs::write(&file, format!("{{\"model\":\"{}\"}}", id.as_str()));
    }

    /// The model backing a role, given the current selection.
    pub fn resolve(&self, kind: ModelKind) -> ModelId {
        let selected = self.selected();
        match kind {
            ModelKind::Transcribe => selected,
            ModelKind::Translate => selected.translate_model(),
        }
    }

    /// Which models are already on disk — switching to one is instant.
    pub fn downloaded(&self) -> Vec<ModelId> {
        ModelId::ALL
            .into_iter()
            .filter(|id| self.path(*id).is_file())
            .collect()
    }

    pub fn path(&self, id: ModelId) -> PathBuf {
        self.dir.join(id.file_name())
    }

    pub fn is_ready(&self, id: ModelId) -> bool {
        self.path(id).is_file()
    }

    /// On-disk truth first, so a model that was already downloaded reads as
    /// ready on a fresh launch without anyone having to ask for it.
    pub fn state(&self, id: ModelId) -> ModelState {
        if let Ok(meta) = std::fs::metadata(self.path(id)) {
            if meta.is_file() {
                return ModelState {
                    status: Status::Ready,
                    received: meta.len(),
                    total: meta.len(),
                    message: None,
                };
            }
        }
        self.states
            .lock()
            .unwrap()
            .get(&id)
            .cloned()
            .unwrap_or_else(ModelState::missing)
    }

    fn set(&self, id: ModelId, state: ModelState) {
        self.states.lock().unwrap().insert(id, state);
    }

    fn bump(&self, id: ModelId, received: u64) {
        if let Some(s) = self.states.lock().unwrap().get_mut(&id) {
            s.received = received;
        }
    }

    /// Download `id` unless it's already on disk. Resumes a partial file when
    /// the server honours a range request, so a dropped connection on a 500 MB
    /// download doesn't start over — which on a phone is the difference between
    /// usable and not.
    pub async fn ensure(
        &self,
        id: ModelId,
        on_progress: &mut (dyn FnMut(u64, u64) + Send),
    ) -> Result<PathBuf> {
        let dest = self.path(id);
        if dest.is_file() {
            return Ok(dest);
        }

        let lock = {
            let mut locks = self.locks.lock().unwrap();
            Arc::clone(locks.entry(id).or_default())
        };
        let _guard = lock.lock().await;
        // Whoever held the lock may have finished the download while we waited.
        if dest.is_file() {
            return Ok(dest);
        }

        tokio::fs::create_dir_all(&self.dir)
            .await
            .map_err(|e| EngineError::msg(format!("Could not create the model folder: {e}")))?;

        let partial = dest.with_extension("download");
        let have = tokio::fs::metadata(&partial).await.map(|m| m.len()).unwrap_or(0);

        self.set(id, ModelState { status: Status::Downloading, received: have, total: 0, message: None });

        let result = self.fetch(id, &partial, &dest, have, on_progress).await;
        if let Err(ref e) = result {
            self.set(
                id,
                ModelState {
                    status: Status::Error,
                    received: 0,
                    total: 0,
                    message: Some(e.to_string()),
                },
            );
        }
        result
    }

    async fn fetch(
        &self,
        id: ModelId,
        partial: &Path,
        dest: &Path,
        have: u64,
        on_progress: &mut (dyn FnMut(u64, u64) + Send),
    ) -> Result<PathBuf> {
        let client = reqwest::Client::new();
        let mut request = client.get(id.url());
        if have > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
        }

        let response = request
            .send()
            .await
            .map_err(|e| EngineError::msg(format!("Model download failed: {e}")))?;

        let resuming = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if !response.status().is_success() {
            return Err(EngineError::msg(format!(
                "Model download failed: HTTP {}",
                response.status()
            )));
        }

        // Only a 206 continues the file we have; a plain 200 is the whole thing
        // again, so the partial has to be thrown away rather than appended to.
        let mut received = if resuming { have } else { 0 };
        let total = received + response.content_length().unwrap_or(0);
        self.set(id, ModelState { status: Status::Downloading, received, total, message: None });

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(resuming)
            .truncate(!resuming)
            .open(partial)
            .await
            .map_err(|e| EngineError::msg(format!("Could not write the model file: {e}")))?;

        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| EngineError::msg(format!("Model download failed: {e}")))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| EngineError::msg(format!("Could not write the model file: {e}")))?;
            received += chunk.len() as u64;
            self.bump(id, received);
            on_progress(received, total);
        }
        file.flush()
            .await
            .map_err(|e| EngineError::msg(format!("Could not write the model file: {e}")))?;
        drop(file);

        // Rename last: a model only becomes visible under its real name once it
        // is complete, so an interrupted run can never be loaded as if whole.
        tokio::fs::rename(partial, dest)
            .await
            .map_err(|e| EngineError::msg(format!("Could not finish the model download: {e}")))?;

        self.set(id, ModelState { status: Status::Ready, received, total, message: None });
        Ok(dest.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The catalogue exists twice — here and in `src/lib/models.ts` — because
    /// the web build has no Rust and the app build has no Node. Nothing keeps
    /// the two honest except this test.
    #[test]
    fn catalogue_matches_the_typescript_one() {
        let ts = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/models.ts"),
        )
        .expect("src/lib/models.ts should be readable");

        for id in ModelId::ALL {
            assert!(
                ts.contains(&format!("id: '{}'", id.as_str())),
                "{} is missing from models.ts",
                id.as_str()
            );
            assert!(
                ts.contains(id.file_name()),
                "{} points at {}, which models.ts doesn't mention",
                id.as_str(),
                id.file_name()
            );
            // models.ts writes byte counts with underscore separators.
            let size = underscored(id.bytes());
            assert!(
                ts.contains(&size),
                "{} is {} bytes here, which doesn't appear in models.ts",
                id.as_str(),
                size
            );
            assert!(
                ts.contains(&format!("translates: {}", id.translates())),
                "no entry in models.ts declares translates: {}",
                id.translates()
            );
        }
    }

    fn underscored(n: u64) -> String {
        let digits = n.to_string();
        let mut out = String::new();
        for (i, c) in digits.char_indices() {
            if i > 0 && (digits.len() - i) % 3 == 0 {
                out.push('_');
            }
            out.push(c);
        }
        out
    }

    /// Turbo is the whole reason the translate role exists separately.
    #[test]
    fn only_turbo_refuses_to_translate() {
        for id in ModelId::ALL {
            assert_eq!(
                id.translates(),
                id != ModelId::LargeV3Turbo,
                "{} translates() is wrong",
                id.as_str()
            );
        }
        assert_eq!(
            ModelId::LargeV3Turbo.translate_model(),
            FALLBACK_TRANSLATE_MODEL,
            "turbo must fall back"
        );
        assert_eq!(
            ModelId::Small.translate_model(),
            ModelId::Small,
            "a model that translates should be reused, not re-downloaded"
        );
    }

    #[test]
    fn ids_round_trip_through_their_strings() {
        for id in ModelId::ALL {
            assert_eq!(ModelId::from_str(id.as_str()), Some(id));
        }
        assert_eq!(ModelId::from_str("nonsense"), None);
    }
}
