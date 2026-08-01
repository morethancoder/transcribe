//! Run whisper.cpp over decoded samples.
//!
//! A port of `src/lib/server/whisper.ts`. That version shells out to
//! `whisper-cli`, asks for full JSON (`-ojf`) and parses per-token offsets back
//! out of the file it writes; here whisper.cpp is linked in, so the same token
//! offsets are read straight off the state and no temporary file is involved.

use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::{EngineError, Result, Segment, Word};

pub struct Transcript {
    pub language: String,
    pub segments: Vec<Segment>,
}

pub struct Options<'a> {
    pub model: &'a Path,
    /// BCP-47-ish whisper language code, or "auto" to detect.
    pub language: &'a str,
    /// Translate to English instead of transcribing verbatim. Requires the
    /// multilingual model — turbo ignores this flag.
    pub translate: bool,
}

/// whisper.cpp counts in centiseconds; the frontend counts in milliseconds.
fn cs_to_ms(cs: i64) -> i64 {
    cs * 10
}

/// Threads to give whisper. Mirrors the web build's `max(4, cpus - 2)`, but
/// also clamped to the core count so a 2-core phone isn't told to run 4.
fn thread_count() -> i32 {
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    cores.saturating_sub(2).max(1).min(cores).max(1) as i32
}

/// Transcribe `samples`.
///
/// `progress` is whisper's own 0..100, published for someone else to read:
/// `full` blocks its thread for the length of the run and whisper.cpp fires the
/// callback from a worker, so the only sound way to report live progress is to
/// park it somewhere shared and have the caller — which runs this on a blocking
/// task and polls — pick it up. `-1` means "nothing reported yet".
pub fn run(
    samples: &[f32],
    opts: Options<'_>,
    progress: &Arc<AtomicI32>,
    cancel: &Arc<AtomicBool>,
) -> Result<Transcript> {
    let ctx = WhisperContext::new_with_params(opts.model, WhisperContextParameters::default())
        .map_err(|e| EngineError::msg(format!("Could not load the Whisper model. {e}")))?;
    let mut state = ctx
        .create_state()
        .map_err(|e| EngineError::msg(format!("Could not start Whisper. {e}")))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(thread_count());
    params.set_translate(opts.translate);
    // whisper.cpp understands the literal "auto" as detect-then-transcribe, so
    // the code passes straight through. (`set_detect_language(true)` is NOT
    // that — it means detect the language and exit without transcribing, the
    // `-dl` flag of whisper-cli.)
    params.set_language(Some(opts.language));
    // Per-token timings are what drive word-level highlighting in the UI.
    params.set_token_timestamps(true);
    // Nothing here should be writing to stdout — this is a GUI app.
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // Both callbacks must be 'static, so they capture their own Arc rather than
    // borrowing anything on this stack frame.
    {
        let progress = Arc::clone(progress);
        params.set_progress_callback_safe(move |p: i32| progress.store(p, Ordering::Relaxed));
    }
    {
        // The explicit `Box<dyn ...>` works around a bug in whisper-rs 0.16.0:
        // `set_abort_callback_safe` stores the closure double-boxed as
        // `Box<dyn FnMut() -> bool>` but instantiates its C trampoline with the
        // caller's own `F`, so the trampoline reinterprets the box's fat
        // pointer as the closure and calls garbage — every run "fails to
        // encode" as if cancelled. Passing a `Box<dyn ...>` *as* `F` makes the
        // stored value and the trampoline's cast line up. (The progress
        // callback does not have this bug; its trampoline is instantiated with
        // the boxed type, whisper_params.rs:598 vs :645.)
        let cancel = Arc::clone(cancel);
        let callback: Box<dyn FnMut() -> bool> =
            Box::new(move || cancel.load(Ordering::Relaxed));
        params.set_abort_callback_safe(callback);
    }

    state
        .full(params, samples)
        .map_err(|e| EngineError::msg(format!("Transcription failed. {e}")))?;

    // whisper.cpp returns Ok with whatever it had when the abort callback
    // stopped it, so cancellation has to be re-checked rather than inferred.
    if cancel.load(Ordering::Relaxed) {
        return Err(EngineError::Cancelled);
    }
    progress.store(100, Ordering::Relaxed);

    let mut segments = Vec::new();
    for i in 0..state.full_n_segments() {
        let Some(segment) = state.get_segment(i) else {
            continue;
        };
        let text = segment.to_str_lossy().unwrap_or_default().trim().to_string();
        if text.is_empty() {
            continue;
        }
        let to = cs_to_ms(segment.end_timestamp());
        let words = words_from_tokens(&segment, to);
        segments.push(Segment {
            from: cs_to_ms(segment.start_timestamp()),
            to,
            text,
            words: if words.is_empty() { None } else { Some(words) },
        });
    }

    let language = if opts.translate {
        // The translate pass always produces English, whatever went in.
        "en".to_string()
    } else if opts.language == "auto" {
        whisper_rs::get_lang_str(state.full_lang_id_from_state())
            .unwrap_or("auto")
            .to_string()
    } else {
        opts.language.to_string()
    };

    Ok(Transcript { language, segments })
}

/// `[_BEG_]`, `[_TT_519]`, … — control tokens, not spoken text.
fn is_special(text: &str) -> bool {
    let t = text.trim();
    t.starts_with("[_") && t.ends_with(']')
}

/// Fold whisper's sub-word tokens into whole words.
///
/// A token that starts with a space opens a new word; everything else (word
/// pieces, punctuation, the apostrophe in "m'appelle") joins the one in
/// progress. Straight port of `tokensToWords` in the web build.
fn words_from_tokens(segment: &whisper_rs::WhisperSegment<'_>, segment_end: i64) -> Vec<Word> {
    let mut words: Vec<Word> = Vec::new();

    for t in 0..segment.n_tokens() {
        let Some(token) = segment.get_token(t) else {
            continue;
        };
        let Ok(text) = token.to_str_lossy() else {
            continue;
        };
        if is_special(&text) || text.trim().is_empty() {
            continue;
        }
        let data = token.token_data();
        if text.starts_with(' ') || words.is_empty() {
            words.push(Word {
                from: cs_to_ms(data.t0),
                to: cs_to_ms(data.t1),
                text: text.trim().to_string(),
            });
        } else if let Some(last) = words.last_mut() {
            last.text.push_str(&text);
            last.to = cs_to_ms(data.t1);
        }
    }

    // Whisper hands back zero-length spans for some words ("lis" at 8.6s->8.6s).
    // Stretch those to meet the next word instead of dropping them — these are
    // real text, and a dropped one would vanish from the transcript.
    for i in 0..words.len() {
        if words[i].to > words[i].from {
            continue;
        }
        let next = words.get(i + 1).map(|w| w.from).unwrap_or(segment_end);
        words[i].to = words[i].from.max(next);
    }

    words
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn special_tokens_are_recognised() {
        assert!(is_special("[_BEG_]"));
        assert!(is_special("[_TT_519]"));
        assert!(!is_special("hello"));
        assert!(!is_special("[laughs]"));
    }

    #[test]
    fn centiseconds_become_milliseconds() {
        assert_eq!(cs_to_ms(0), 0);
        assert_eq!(cs_to_ms(860), 8600);
    }

    #[test]
    fn threads_stay_within_the_core_count() {
        let n = thread_count();
        assert!(n >= 1);
        assert!(n as usize <= std::thread::available_parallelism().map(|c| c.get()).unwrap_or(4));
    }
}
