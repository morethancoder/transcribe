//! An in-app log: what the engine did, kept where a phone can show it.
//!
//! On desktop a failing run can be watched from a terminal; on a phone there is
//! nothing to watch, which made every mobile bug a guessing game. So the engine
//! logs into a ring buffer the Settings → Developer screen can read over IPC,
//! and mirrors it to a file that survives a crash or a restart.
//!
//! A global rather than managed state, because the engine modules (`model`,
//! `whisper`) have no `AppHandle` and threading one through every call would
//! reshape the whole engine for the sake of a log line.

use std::collections::VecDeque;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Info,
    Warn,
    Error,
}

impl Level {
    fn tag(self) -> &'static str {
        match self {
            Self::Info => "INFO",
            Self::Warn => "WARN",
            Self::Error => "ERROR",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Unix epoch milliseconds; the frontend localises the display.
    pub at_ms: i64,
    pub level: Level,
    /// Which part spoke: `engine`, `model`, `whisper`, `ui`, …
    pub source: String,
    pub message: String,
}

/// Entries kept in memory. Enough to hold several runs; small enough that the
/// IPC payload for the logs screen stays trivial.
const KEEP: usize = 800;

/// The file is trimmed to half this whenever a launch finds it bigger.
const FILE_LIMIT: u64 = 512 * 1024;

struct Sink {
    entries: VecDeque<Entry>,
    file: Option<std::fs::File>,
}

static SINK: OnceLock<Mutex<Sink>> = OnceLock::new();

fn sink() -> &'static Mutex<Sink> {
    SINK.get_or_init(|| {
        Mutex::new(Sink {
            entries: VecDeque::new(),
            file: None,
        })
    })
}

/// Point the log at `dir/transcribe.log`, trimming an oversized file down to
/// its recent half. Failures fall back to memory-only logging — a read-only
/// disk shouldn't take the logs screen down with it.
pub fn attach_file(dir: PathBuf) {
    let path = dir.join("transcribe.log");
    let _ = std::fs::create_dir_all(&dir);

    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > FILE_LIMIT {
            if let Ok(text) = std::fs::read_to_string(&path) {
                let half = text.len() / 2;
                // Cut at a line break so the file never opens mid-entry.
                let keep = text[half..].find('\n').map(|i| half + i + 1).unwrap_or(half);
                let _ = std::fs::write(&path, &text[keep..]);
            }
        }
    }

    let file = std::fs::OpenOptions::new().create(true).append(true).open(&path);
    if let Ok(file) = file {
        sink().lock().unwrap().file = Some(file);
    }
}

pub fn log(level: Level, source: &str, message: impl Into<String>) {
    let message = message.into();
    let at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    #[cfg(debug_assertions)]
    eprintln!("{} [{source}] {message}", level.tag());

    let mut sink = sink().lock().unwrap();
    if let Some(file) = sink.file.as_mut() {
        // Epoch ms rather than a formatted date: the screen in Settings is the
        // reader, and it localises; the raw file is only a crash fallback.
        let _ = writeln!(file, "{at_ms} {} [{source}] {message}", level.tag());
    }
    sink.entries.push_back(Entry {
        at_ms,
        level,
        source: source.to_string(),
        message,
    });
    if sink.entries.len() > KEEP {
        sink.entries.pop_front();
    }
}

pub fn info(source: &str, message: impl Into<String>) {
    log(Level::Info, source, message);
}

pub fn warn(source: &str, message: impl Into<String>) {
    log(Level::Warn, source, message);
}

pub fn error(source: &str, message: impl Into<String>) {
    log(Level::Error, source, message);
}

pub fn recent() -> Vec<Entry> {
    sink().lock().unwrap().entries.iter().cloned().collect()
}

pub fn clear() {
    let mut sink = sink().lock().unwrap();
    sink.entries.clear();
    if let Some(file) = sink.file.as_mut() {
        let _ = file.set_len(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_the_most_recent() {
        clear();
        for i in 0..(KEEP + 10) {
            info("test", format!("line {i}"));
        }
        let entries = recent();
        assert_eq!(entries.len(), KEEP);
        assert!(entries.last().unwrap().message.ends_with(&format!("{}", KEEP + 9)));
        clear();
    }
}
