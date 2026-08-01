//! Run the engine against a real media file, no GUI involved.
//!
//!     cargo run --example engine_smoke -- <media> <model.bin> [language]
//!
//! Exists because "the engine compiles" and "the engine transcribes" are very
//! different claims: this exercises the whole in-process pipeline — symphonia
//! decode, the hand-rolled resampler, whisper-rs, token folding — on actual
//! audio, exactly as the Tauri commands drive it.

use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;

use transcrape_lib::engine::{audio, whisper};

fn main() {
    let mut args = std::env::args().skip(1);
    let media = args.next().expect("usage: engine_smoke <media> <model.bin> [language]");
    let model = args.next().expect("usage: engine_smoke <media> <model.bin> [language]");
    let language = args.next().unwrap_or_else(|| "auto".into());

    let cancel = Arc::new(AtomicBool::new(false));

    eprintln!("decoding {media} …");
    let file = std::fs::File::open(&media).expect("could not open media file");
    let ext = media.rsplit('.').next().map(str::to_owned);
    let decoded = audio::decode(
        file,
        ext.as_deref(),
        &mut |p| eprint!("\r  decode {:>3.0}%", p * 100.0),
        &cancel,
    )
    .expect("decode failed");
    eprintln!(
        "\n  {} samples ({:.1} s) — duration_ms={}",
        decoded.samples.len(),
        decoded.samples.len() as f64 / audio::TARGET_RATE as f64,
        decoded.duration_ms
    );

    eprintln!("transcribing with {model} (language={language}) …");
    let progress = Arc::new(AtomicI32::new(-1));
    let transcript = whisper::run(
        &decoded.samples,
        whisper::Options {
            model: std::path::Path::new(&model),
            language: &language,
            translate: false,
        },
        &progress,
        &cancel,
    )
    .expect("transcription failed");
    eprintln!("  final progress: {}%", progress.load(Ordering::Relaxed));

    println!("language: {}", transcript.language);
    for seg in &transcript.segments {
        let words = seg.words.as_ref().map(|w| w.len()).unwrap_or(0);
        println!("[{:>6}ms → {:>6}ms] ({words} words) {}", seg.from, seg.to, seg.text);
    }
    println!("segments: {}", transcript.segments.len());
}
