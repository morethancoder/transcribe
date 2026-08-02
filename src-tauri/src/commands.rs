//! The IPC surface, standing in for `src/routes/api/*`.
//!
//! The web build streams NDJSON progress events out of a long-lived POST.
//! Tauri has no streaming response, so each run takes a `Channel` the frontend
//! opened and pushes the same event shapes down it — see `engine::ProgressEvent`,
//! which mirrors the web build's union field for field.

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::State;
use tauri_plugin_fs::FsExt;

use crate::engine::model::{ModelId, ModelKind, ModelState, Models};
use crate::engine::jobs::{self, Job, Jobs};
use crate::engine::{audio, whisper, EngineError, Phase, ProgressEvent, Result, Segment};
use crate::keepalive::KeepAwake;
use crate::logs;

/// Share of the bar the decode step gets; whisper dominates the rest. Same
/// split as the web build, so the bar behaves identically across the two.
const DECODE_SHARE: f64 = 0.08;

pub struct AppState {
    pub models: Models,
    pub jobs: Jobs,
    /// Cancel flags, keyed by the run id the frontend generated.
    runs: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn new(models_dir: PathBuf, cache_dir: PathBuf) -> Self {
        Self {
            models: Models::new(models_dir),
            jobs: Jobs::new(cache_dir),
            runs: Mutex::new(HashMap::new()),
        }
    }

    fn begin(&self, run_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.runs.lock().unwrap().insert(run_id.to_string(), Arc::clone(&flag));
        flag
    }

    fn end(&self, run_id: &str) {
        self.runs.lock().unwrap().remove(run_id);
    }
}

/// Progress in permille, so a blocking worker can publish it without locking.
#[derive(Clone)]
struct Meter(Arc<AtomicU32>);

impl Meter {
    fn new() -> Self {
        Self(Arc::new(AtomicU32::new(0)))
    }
    fn set(&self, fraction: f64) {
        self.0.store((fraction.clamp(0.0, 1.0) * 1000.0) as u32, Ordering::Relaxed);
    }
    fn get(&self) -> f64 {
        self.0.load(Ordering::Relaxed) as f64 / 1000.0
    }
}

/// Emit `phase`/`progress` on the channel every 150 ms until `done` flips.
///
/// Both the decoder and whisper block a thread for minutes at a time, so the
/// only way progress reaches the UI is for them to publish into an atomic and
/// for this to forward it from an async task.
fn pump(
    channel: Channel<ProgressEvent>,
    meter: Meter,
    phase: Phase,
    map: impl Fn(f64) -> f64 + Send + 'static,
    done: Arc<AtomicBool>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last = -1.0f64;
        while !done.load(Ordering::Relaxed) {
            let value = map(meter.get());
            // Only speak when something changed, to keep the IPC quiet.
            if (value - last).abs() > 0.001 {
                last = value;
                let _ = channel.send(ProgressEvent::Progress { phase, progress: value });
            }
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
    })
}

#[tauri::command]
pub fn model_state(state: State<'_, AppState>, kind: ModelKind) -> ModelState {
    state.models.state(state.models.resolve(kind))
}

/// What the model picker needs beyond raw download status.
///
/// `selected` and `resolved` differ whenever the chosen model can't translate:
/// the first is what the user picked, the second is what the asked-about role
/// will actually load.
#[derive(serde::Serialize)]
pub struct ModelSelection {
    pub selected: &'static str,
    pub resolved: &'static str,
    pub available: Vec<&'static str>,
}

#[tauri::command]
pub fn model_selection(state: State<'_, AppState>, kind: ModelKind) -> ModelSelection {
    ModelSelection {
        selected: state.models.selected().as_str(),
        resolved: state.models.resolve(kind).as_str(),
        available: state
            .models
            .downloaded()
            .into_iter()
            .map(ModelId::as_str)
            .collect(),
    }
}

/// Choose the transcription model. Nothing is downloaded here — the next run,
/// or the picker's own polling, pulls it if it isn't on disk yet.
#[tauri::command]
pub fn select_model(state: State<'_, AppState>, model: String) -> Result<()> {
    let id = ModelId::from_str(&model).ok_or_else(|| EngineError::msg("Unknown model."))?;
    state.models.select(id);
    Ok(())
}

/// Fetch a model, reporting progress. Called on its own so the UI can show the
/// one-time download before anyone picks a file, exactly as the web build's
/// `/api/model` polling does.
#[tauri::command]
pub async fn ensure_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    kind: ModelKind,
    on_event: Channel<ProgressEvent>,
) -> Result<()> {
    // Held across the await so Android can't freeze the process — and the
    // download with it — when the app leaves the foreground mid-fetch.
    let _keep = KeepAwake::new(&app, "Downloading a model");
    let mut report = |received: u64, total: u64| {
        let progress = if total > 0 { received as f64 / total as f64 } else { 0.0 };
        let _ = on_event.send(ProgressEvent::Progress { phase: Phase::Downloading, progress });
    };
    state.models.ensure(state.models.resolve(kind), &mut report).await?;
    Ok(())
}

/// Let the webview load one picked file over the asset protocol, for the
/// poster frame and playback. The scope starts empty and grows only by the
/// files the user has actually picked — never a directory.
///
/// Android hands the picker a `content://` URI the asset protocol can't read;
/// the frontend treats a failure here as "no preview" and carries on.
#[tauri::command]
pub fn allow_media(app: tauri::AppHandle, path: String) -> Result<()> {
    use tauri::Manager;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| EngineError::msg(format!("Could not expose the file for preview: {e}")))
}

#[tauri::command]
pub fn cancel_run(state: State<'_, AppState>, run_id: String) {
    if let Some(flag) = state.runs.lock().unwrap().get(&run_id) {
        logs::info("engine", "run cancelled by the user");
        flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn logs_recent() -> Vec<logs::Entry> {
    logs::recent()
}

#[tauri::command]
pub fn logs_clear() {
    logs::clear();
}

/// Frontend errors land in the same log as the engine's, so the Developer
/// screen tells one story. Length-capped: this is reachable from the webview.
#[tauri::command]
pub fn log_event(level: String, source: String, message: String) {
    let level = match level.as_str() {
        "error" => logs::Level::Error,
        "warn" => logs::Level::Warn,
        _ => logs::Level::Info,
    };
    logs::log(level, trim_to(&source, 32), trim_to(&message, 2000));
}

/// Truncate on a char boundary — `String::truncate` panics mid-codepoint,
/// and the webview can send anything.
fn trim_to(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// Is this job's decoded audio still around to play or translate?
#[tauri::command]
pub fn job_audio_ready(state: State<'_, AppState>, job_id: String) -> bool {
    state.jobs.get(&job_id).is_some()
}

/// The decoded audio, for the history screen's player. Returned as bytes for
/// the frontend to wrap in a blob URL — the same role `/api/audio` plays on the
/// web, and it keeps the cache directory out of the webview's reach.
#[tauri::command]
pub fn job_audio(state: State<'_, AppState>, job_id: String) -> Result<Vec<u8>> {
    let job = state
        .jobs
        .get(&job_id)
        .ok_or_else(|| EngineError::msg("That audio has expired."))?;
    std::fs::read(&job.wav).map_err(|e| EngineError::msg(format!("Could not read the audio: {e}")))
}

/// Turn whatever the picker produced into an open file.
///
/// On desktop `path` is a plain filesystem path. On Android it is a
/// `content://` URI, which no `File::open` can touch — the fs plugin routes it
/// through the platform's content resolver and hands back a real descriptor.
/// Either way the engine downstream just sees a `File`.
fn open_media(app: &tauri::AppHandle, raw: &str) -> Result<std::fs::File> {
    let path: tauri_plugin_fs::FilePath = raw.parse().expect("FilePath parsing is infallible");
    let mut opts = tauri_plugin_fs::OpenOptions::new();
    opts.read(true);
    app.fs()
        .open(path, opts)
        .map_err(|e| EngineError::msg(format!("Could not open the file: {e}")))
}

/// The extension of the picked file, when the path visibly carries one —
/// content URIs don't. Only a probing hint; symphonia sniffs the bytes anyway.
fn ext_hint(raw: &str) -> Option<String> {
    let name = raw.rsplit(['/', '\\']).next()?;
    let (stem, ext) = name.rsplit_once('.')?;
    (!stem.is_empty() && !ext.is_empty() && ext.len() <= 5 && !ext.contains("//"))
        .then(|| ext.to_ascii_lowercase())
}

#[tauri::command]
pub async fn transcribe(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    run_id: String,
    path: String,
    language: String,
    on_event: Channel<ProgressEvent>,
) -> Result<()> {
    let _keep = KeepAwake::new(&app, "Transcribing");
    logs::info("engine", format!("transcribe: {path} (language {language})"));
    let started = std::time::Instant::now();

    let cancel = state.begin(&run_id);
    let result = run_transcribe(&app, &state, &path, &language, &cancel, &on_event).await;
    state.end(&run_id);

    match result {
        Ok(transcript) => {
            logs::info(
                "engine",
                format!(
                    "transcribed {} segments in {:.1}s",
                    transcript.segments.len(),
                    started.elapsed().as_secs_f64()
                ),
            );
            let _ = on_event.send(ProgressEvent::Done {
                language: transcript.language,
                segments: transcript.segments,
            });
            Ok(())
        }
        Err(e) => {
            // Cancellation is the user's doing, not a failure to report.
            if !matches!(e, EngineError::Cancelled) {
                logs::error("engine", format!("transcribe failed: {e}"));
                let _ = on_event.send(ProgressEvent::Error { message: e.to_string() });
            }
            Err(e)
        }
    }
}

async fn run_transcribe(
    app: &tauri::AppHandle,
    state: &AppState,
    path: &str,
    language: &str,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<ProgressEvent>,
) -> Result<whisper::Transcript> {
    // The model has to be on disk before anything else is worth doing.
    let transcribe_model = state.models.resolve(ModelKind::Transcribe);
    if !state.models.is_ready(transcribe_model) {
        logs::info(
            "engine",
            format!("model {} is not on disk — downloading first", transcribe_model.as_str()),
        );
        let mut report = |received: u64, total: u64| {
            let progress = if total > 0 { received as f64 / total as f64 } else { 0.0 };
            let _ = on_event.send(ProgressEvent::Progress { phase: Phase::Downloading, progress });
        };
        state.models.ensure(transcribe_model, &mut report).await?;
    }
    let model = state.models.path(transcribe_model);

    // --- decode -------------------------------------------------------------
    let _ = on_event.send(ProgressEvent::Progress { phase: Phase::Preparing, progress: 0.0 });
    let meter = Meter::new();
    let done = Arc::new(AtomicBool::new(false));
    let pump_handle = pump(
        on_event.clone(),
        meter.clone(),
        Phase::Preparing,
        |p| p * DECODE_SHARE,
        Arc::clone(&done),
    );

    let decoded = {
        // Opened here rather than inside the blocking task so a bad pick fails
        // fast, before any progress theatre starts.
        let file = open_media(app, path)?;
        let hint = ext_hint(path);
        let meter = meter.clone();
        let cancel = Arc::clone(cancel);
        tokio::task::spawn_blocking(move || {
            audio::decode(file, hint.as_deref(), &mut |p| meter.set(p), &cancel)
        })
        .await
        .map_err(|e| EngineError::msg(format!("Decoding stopped unexpectedly: {e}")))?
    };
    done.store(true, Ordering::Relaxed);
    let _ = pump_handle.await;
    let decoded = decoded?;

    logs::info(
        "engine",
        format!(
            "decoded {:.1}s of audio ({} samples at 16 kHz)",
            decoded.duration_ms as f64 / 1000.0,
            decoded.samples.len()
        ),
    );

    // The id exists before the run finishes so this Meta can go out *now*:
    // the duration is what the frontend's ETA falls back on before whisper
    // reports progress, and whisper's first report can be minutes away on a
    // phone. Held back until the end, it left the bar saying "estimating…"
    // for entire runs.
    let job_id = uuid::Uuid::new_v4().to_string();
    let _ = on_event.send(ProgressEvent::Meta {
        job_id: job_id.clone(),
        duration_ms: decoded.duration_ms,
    });

    // --- transcribe ---------------------------------------------------------
    let _ = on_event.send(ProgressEvent::Progress {
        phase: Phase::Transcribing,
        progress: DECODE_SHARE,
    });
    let transcript = run_whisper(
        decoded.samples.clone(),
        model,
        language.to_string(),
        false,
        Phase::Transcribing,
        on_event.clone(),
        cancel,
        |p| DECODE_SHARE + p * (1.0 - DECODE_SHARE),
    )
    .await?;

    // --- keep the audio for translation and playback -------------------------
    state.jobs.ensure_dir()?;
    let wav = state.jobs.wav_path(&job_id);
    let samples = decoded.samples;
    let wav_for_write = wav.clone();
    tokio::task::spawn_blocking(move || jobs::write_wav(&wav_for_write, &samples))
        .await
        .map_err(|e| EngineError::msg(format!("Could not cache the audio: {e}")))??;
    state.jobs.keep(Job {
        id: job_id,
        wav,
        language: transcript.language.clone(),
        created_at: std::time::SystemTime::now(),
    });

    Ok(transcript)
}

#[tauri::command]
pub async fn translate(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    run_id: String,
    job_id: String,
    on_event: Channel<ProgressEvent>,
) -> Result<()> {
    let _keep = KeepAwake::new(&app, "Translating");
    logs::info("engine", format!("translate: job {job_id}"));
    let started = std::time::Instant::now();

    let cancel = state.begin(&run_id);
    let result = run_translate(&state, &job_id, &cancel, &on_event).await;
    state.end(&run_id);

    match result {
        Ok(transcript) => {
            logs::info(
                "engine",
                format!(
                    "translated {} segments in {:.1}s",
                    transcript.segments.len(),
                    started.elapsed().as_secs_f64()
                ),
            );
            let _ = on_event.send(ProgressEvent::Done {
                language: transcript.language,
                segments: transcript.segments,
            });
            Ok(())
        }
        Err(e) => {
            if !matches!(e, EngineError::Cancelled) {
                logs::error("engine", format!("translate failed: {e}"));
                let _ = on_event.send(ProgressEvent::Error { message: e.to_string() });
            }
            Err(e)
        }
    }
}

async fn run_translate(
    state: &AppState,
    job_id: &str,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<ProgressEvent>,
) -> Result<whisper::Transcript> {
    let job = state.jobs.get(job_id).ok_or_else(|| {
        EngineError::msg("That audio has expired — transcribe the file again to translate it.")
    })?;

    // Turbo can't translate, so this is where the second model gets fetched.
    let translate_model = state.models.resolve(ModelKind::Translate);
    if !state.models.is_ready(translate_model) {
        let mut report = |received: u64, total: u64| {
            let progress = if total > 0 { received as f64 / total as f64 } else { 0.0 };
            let _ = on_event.send(ProgressEvent::Progress { phase: Phase::Downloading, progress });
        };
        state.models.ensure(translate_model, &mut report).await?;
    }
    let model = state.models.path(translate_model);

    let wav = job.wav.clone();
    let samples = tokio::task::spawn_blocking(move || jobs::read_wav(&wav))
        .await
        .map_err(|e| EngineError::msg(format!("Could not read the audio: {e}")))??;

    run_whisper(
        samples,
        model,
        job.language.clone(),
        true,
        Phase::Translating,
        on_event.clone(),
        cancel,
        |p| p,
    )
    .await
}

/// Run whisper on a blocking thread while forwarding its progress.
#[allow(clippy::too_many_arguments)]
async fn run_whisper(
    samples: Vec<f32>,
    model: PathBuf,
    language: String,
    translate: bool,
    phase: Phase,
    channel: Channel<ProgressEvent>,
    cancel: &Arc<AtomicBool>,
    map: impl Fn(f64) -> f64 + Send + 'static,
) -> Result<whisper::Transcript> {
    let percent = Arc::new(AtomicI32::new(-1));
    let meter = Meter::new();
    let done = Arc::new(AtomicBool::new(false));

    // whisper publishes 0..100; the meter wants 0..1.
    let mirror = {
        let percent = Arc::clone(&percent);
        let meter = meter.clone();
        let done = Arc::clone(&done);
        tokio::spawn(async move {
            while !done.load(Ordering::Relaxed) {
                let p = percent.load(Ordering::Relaxed);
                if p >= 0 {
                    meter.set(p as f64 / 100.0);
                }
                tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            }
        })
    };
    let pump_handle = pump(channel, meter, phase, map, Arc::clone(&done));

    let cancel_for_run = Arc::clone(cancel);
    let out = tokio::task::spawn_blocking(move || {
        whisper::run(
            &samples,
            whisper::Options { model: &model, language: &language, translate },
            &percent,
            &cancel_for_run,
        )
    })
    .await
    .map_err(|e| EngineError::msg(format!("Transcription stopped unexpectedly: {e}")))?;

    done.store(true, Ordering::Relaxed);
    let _ = mirror.await;
    let _ = pump_handle.await;
    out
}

/// Re-exported so `Segment` stays reachable from the generated command types.
#[allow(unused)]
type _Segment = Segment;
