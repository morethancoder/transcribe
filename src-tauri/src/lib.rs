//! Transcrape as a native app.
//!
//! The web build of transcrape is a Node server that shells out to `ffmpeg` and
//! `whisper-cli`. Neither is available here: Tauri's mobile targets have no Node
//! runtime, and iOS forbids spawning child processes outright, so the engine is
//! reimplemented in-process — see the `engine` module.

mod commands;
// Public for examples/engine_smoke.rs, which drives the pipeline without a GUI.
pub mod engine;
mod keepalive;
pub mod logs;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // The fs plugin is not for the frontend (no fs permission is granted in
        // capabilities/) — the Rust side uses it to open Android `content://`
        // URIs through the platform's content resolver. See commands::open_media.
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Models are large and permanent, decoded audio is large and
            // disposable, so they go in different places: on every platform the
            // data dir is backed up and the cache dir is what the OS reclaims
            // first when storage runs low. On iOS that distinction is a review
            // requirement, not just good manners.
            let models_dir = app.path().app_data_dir()?.join("models");
            let cache_dir = app.path().app_cache_dir()?.join("audio");

            // The log file lives in the platform's log dir and survives a
            // crash — the Settings → Developer screen reads the live buffer.
            if let Ok(log_dir) = app.path().app_log_dir() {
                logs::attach_file(log_dir);
            }
            logs::info(
                "app",
                format!(
                    "Transcribe v{} on {} {} ({} cores)",
                    env!("CARGO_PKG_VERSION"),
                    std::env::consts::OS,
                    std::env::consts::ARCH,
                    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0)
                ),
            );

            let state = commands::AppState::new(models_dir, cache_dir);
            // Cached audio from a previous launch is unreachable — the registry
            // is in memory — so clear it out rather than leak it.
            state.jobs.reap_orphans();
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::model_state,
            commands::model_selection,
            commands::select_model,
            commands::ensure_model,
            commands::allow_media,
            commands::transcribe,
            commands::translate,
            commands::cancel_run,
            commands::job_audio_ready,
            commands::job_audio,
            commands::logs_recent,
            commands::logs_clear,
            commands::log_event,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start transcrape");
}
