//! The transcription engine, reimplemented for the app build.
//!
//! The web build of transcrape drives two external binaries: `ffmpeg` decodes
//! the source file to a 16 kHz mono WAV, and `whisper-cli` transcribes it. An
//! app can't do that. Tauri's mobile targets have no Node runtime to spawn them
//! from, and iOS forbids spawning child processes at all, so both jobs move
//! in-process: `audio` replaces ffmpeg with symphonia, and `whisper` replaces
//! whisper-cli with whisper.cpp linked directly through whisper-rs.
//!
//! The types below deliberately mirror `src/lib/types.ts` field for field, so
//! the same Svelte components render a transcript from either backend.

pub mod audio;
pub mod jobs;
pub mod model;
pub mod whisper;

use serde::{Deserialize, Serialize};

/// One word, with the timings whisper's token offsets imply. Milliseconds, to
/// match the web build — whisper itself counts in centiseconds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    pub from: i64,
    pub to: i64,
    pub text: String,
}

/// One line of transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub from: i64,
    pub to: i64,
    pub text: String,
    /// Absent when whisper gave no usable token offsets. `skip_serializing_if`
    /// keeps it *absent* rather than `null`, because the frontend tells the two
    /// apart: `words?.length` decides whole-line versus per-word highlighting.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<Word>>,
}

/// Steps a run passes through; each one labels the shared progress bar.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Preparing,
    Transcribing,
    Downloading,
    Translating,
}

/// Mirrors the NDJSON events the web build streams from `/api/transcribe`.
/// Tauri has no streaming response, so these go out as events on a per-run
/// channel instead — see `commands`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ProgressEvent {
    Meta {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "durationMs")]
        duration_ms: i64,
    },
    /// `progress` is the whole run's 0..1 completion: the engine owns the
    /// weighting between phases, since only it knows which ones will run.
    Progress { phase: Phase, progress: f64 },
    Done {
        language: String,
        segments: Vec<Segment>,
    },
    Error { message: String },
}

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("Cancelled")]
    Cancelled,
    #[error("{0}")]
    Message(String),
}

impl EngineError {
    pub fn msg(text: impl Into<String>) -> Self {
        Self::Message(text.into())
    }
}

impl serde::Serialize for EngineError {
    // Spelled out because the bare `Result` in this module is the engine's own
    // one-argument alias below, not std's.
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, EngineError>;
