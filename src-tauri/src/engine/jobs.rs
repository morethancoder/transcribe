//! Decoded audio kept around after a transcription finishes.
//!
//! A port of `src/lib/server/jobs.ts`, for the same reason it exists there:
//! "Translate to English" re-runs whisper over the same audio, and the history
//! screen plays it back, so throwing it away at the end of a run would mean
//! decoding the source file twice. Entries expire so the cache doesn't grow
//! without bound — which matters more on a phone than it did on a dev server.
//!
//! The samples land on disk as a 16 kHz mono WAV rather than staying in memory:
//! an hour of audio is ~230 MB as `f32`, and that is not something to hold in a
//! mobile app's heap between screens.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use super::audio::TARGET_RATE;
use super::{EngineError, Result};

/// How long decoded audio stays on disk, matching the web build's default.
const TTL: Duration = Duration::from_secs(6 * 60 * 60);
const MAX_JOBS: usize = 20;

#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub wav: PathBuf,
    /// Detected (or chosen) spoken language — the translate pass reuses it.
    pub language: String,
    pub created_at: SystemTime,
}

pub struct Jobs {
    dir: PathBuf,
    jobs: Mutex<HashMap<String, Job>>,
}

impl Jobs {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir, jobs: Mutex::new(HashMap::new()) }
    }

    pub fn wav_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.wav"))
    }

    pub fn keep(&self, job: Job) {
        self.jobs.lock().unwrap().insert(job.id.clone(), job);
        self.sweep();
    }

    pub fn get(&self, id: &str) -> Option<Job> {
        let job = self.jobs.lock().unwrap().get(id).cloned()?;
        if job.created_at.elapsed().unwrap_or_default() > TTL {
            self.discard(id);
            return None;
        }
        // A restart empties the registry but not the folder, so a job can be
        // known and still have had its file swept from under it.
        job.wav.is_file().then_some(job)
    }

    pub fn discard(&self, id: &str) {
        if let Some(job) = self.jobs.lock().unwrap().remove(id) {
            let _ = std::fs::remove_file(&job.wav);
        }
    }

    pub fn ensure_dir(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|e| EngineError::msg(format!("Could not create the audio cache: {e}")))
    }

    /// Drop expired jobs, then the oldest ones over the cap.
    fn sweep(&self) {
        let mut jobs = self.jobs.lock().unwrap();
        let mut live: Vec<Job> = jobs.values().cloned().collect();
        live.sort_by_key(|j| j.created_at);

        let expired: Vec<String> = live
            .iter()
            .filter(|j| j.created_at.elapsed().unwrap_or_default() > TTL)
            .map(|j| j.id.clone())
            .collect();
        let fresh: Vec<&Job> = live
            .iter()
            .filter(|j| j.created_at.elapsed().unwrap_or_default() <= TTL)
            .collect();
        let overflow: Vec<String> = fresh
            .iter()
            .take(fresh.len().saturating_sub(MAX_JOBS))
            .map(|j| j.id.clone())
            .collect();

        for id in expired.into_iter().chain(overflow) {
            if let Some(job) = jobs.remove(&id) {
                let _ = std::fs::remove_file(&job.wav);
            }
        }
    }

    /// Files from a previous launch are unreachable — the registry lives in
    /// memory — so without this they would leak. Age-gated for the same reason
    /// the web build gates it: a job created moments ago may still be in use.
    pub fn reap_orphans(&self) {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("wav") {
                continue;
            }
            let stale = entry
                .metadata()
                .and_then(|m| m.modified())
                .map(|t| t.elapsed().unwrap_or_default() > Duration::from_secs(600))
                .unwrap_or(false);
            if stale {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

/// Only tests want a numeric timestamp; the engine passes `SystemTime` around.
#[cfg(test)]
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Write mono 16 kHz samples as a 16-bit PCM WAV.
///
/// Hand-rolled because it is 40 lines of header and the alternative is another
/// dependency to cross-compile for two mobile ABIs. 16-bit rather than float so
/// the file is half the size and any player can open it.
pub fn write_wav(path: &Path, samples: &[f32]) -> Result<()> {
    let io = |e: std::io::Error| EngineError::msg(format!("Could not cache the audio: {e}"));
    let mut file = std::io::BufWriter::new(std::fs::File::create(path).map_err(io)?);

    let data_len = (samples.len() * 2) as u32;
    let channels: u16 = 1;
    let bits: u16 = 16;
    let byte_rate = TARGET_RATE * channels as u32 * (bits / 8) as u32;
    let block_align = channels * (bits / 8);

    file.write_all(b"RIFF").map_err(io)?;
    file.write_all(&(36 + data_len).to_le_bytes()).map_err(io)?;
    file.write_all(b"WAVEfmt ").map_err(io)?;
    file.write_all(&16u32.to_le_bytes()).map_err(io)?; // PCM header size
    file.write_all(&1u16.to_le_bytes()).map_err(io)?; // format: PCM
    file.write_all(&channels.to_le_bytes()).map_err(io)?;
    file.write_all(&TARGET_RATE.to_le_bytes()).map_err(io)?;
    file.write_all(&byte_rate.to_le_bytes()).map_err(io)?;
    file.write_all(&block_align.to_le_bytes()).map_err(io)?;
    file.write_all(&bits.to_le_bytes()).map_err(io)?;
    file.write_all(b"data").map_err(io)?;
    file.write_all(&data_len.to_le_bytes()).map_err(io)?;

    for s in samples {
        let clamped = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        file.write_all(&clamped.to_le_bytes()).map_err(io)?;
    }
    file.flush().map_err(io)?;
    Ok(())
}

/// Read back what `write_wav` wrote. Only handles that exact shape — this never
/// sees a file the app didn't produce itself.
pub fn read_wav(path: &Path) -> Result<Vec<f32>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .and_then(|mut f| f.read_to_end(&mut bytes))
        .map_err(|e| EngineError::msg(format!("Could not read the cached audio: {e}")))?;
    if bytes.len() < 44 {
        return Err(EngineError::msg("The cached audio is corrupt."));
    }
    Ok(bytes[44..]
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / i16::MAX as f32)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_survives_a_round_trip() {
        let dir = std::env::temp_dir().join(format!("transcrape-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.wav");

        let samples: Vec<f32> = (0..1000).map(|i| i as f32 / 500.0 - 1.0).collect();
        write_wav(&path, &samples).unwrap();
        let back = read_wav(&path).unwrap();

        assert_eq!(back.len(), samples.len());
        for (a, b) in samples.iter().zip(back.iter()) {
            // 16-bit quantisation is the only loss we accept here.
            assert!((a - b).abs() < 1e-3, "{a} vs {b}");
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn wav_header_is_the_right_length() {
        let dir = std::env::temp_dir().join(format!("transcrape-hdr-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("b.wav");

        write_wav(&path, &[0.0; 8]).unwrap();
        let bytes = std::fs::read(&path).unwrap();

        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(bytes.len(), 44 + 16, "header plus 8 samples at 2 bytes each");
        std::fs::remove_dir_all(&dir).ok();
    }
}
