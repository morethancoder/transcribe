//! Decode any container down to the 16 kHz mono f32 whisper.cpp wants.
//!
//! This is the ffmpeg replacement. The web build shells out to
//! `ffmpeg -vn -ac 1 -ar 16000`; here symphonia demuxes and decodes in-process,
//! the channels are averaged to mono, and a windowed-sinc filter resamples to
//! 16 kHz. Nothing is written to disk on the way — whisper wants the samples in
//! memory anyway, and a phone shouldn't spend a WAV-sized write to get there.

use std::fs::File;
use std::sync::atomic::{AtomicBool, Ordering};

use symphonia::core::audio::{AudioBufferRef, SampleBuffer};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use super::{EngineError, Result};

/// What whisper.cpp is hard-wired to expect.
pub const TARGET_RATE: u32 = 16_000;

pub struct Decoded {
    /// Mono 16 kHz samples, nominally -1.0..=1.0.
    pub samples: Vec<f32>,
    /// Length of the source media, or 0 when the container didn't say — a
    /// missing duration only costs the ETA, as in the web build.
    pub duration_ms: i64,
}

/// Decode an already-open `file`, reporting 0..1 progress and bailing out when
/// `cancel` flips.
///
/// Takes a `File` rather than a path because on Android the picker hands back
/// a `content://` URI, which only the fs plugin (via the platform's content
/// resolver) can turn into something readable — `File::open` on it fails. The
/// caller owns that resolution; by the time the engine is involved there is
/// just a file descriptor, the same on every platform.
pub fn decode(
    file: File,
    ext_hint: Option<&str>,
    on_progress: &mut dyn FnMut(f64),
    cancel: &AtomicBool,
) -> Result<Decoded> {
    let stream = MediaSourceStream::new(Box::new(file), Default::default());

    // The extension is only a hint; symphonia still sniffs the actual bytes, so
    // a mislabelled file (or none at all — content URIs) probes correctly.
    let mut hint = Hint::new();
    if let Some(ext) = ext_hint {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, stream, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| unsupported(e))?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| EngineError::msg("This file has no audio track."))?;
    let track_id = track.id;
    let params = track.codec_params.clone();

    let mut decoder = symphonia::default::get_codecs()
        .make(&params, &DecoderOptions::default())
        .map_err(|e| unsupported(e))?;

    // Total frames drives both the reported duration and the progress bar.
    let source_rate = params.sample_rate.unwrap_or(TARGET_RATE);
    let total_frames = params.n_frames.unwrap_or(0);
    let duration_ms = if total_frames > 0 && source_rate > 0 {
        (total_frames as i64 * 1000) / source_rate as i64
    } else {
        0
    };

    let mut mono: Vec<f32> = Vec::with_capacity(total_frames.max(1) as usize);
    let mut buffer: Option<SampleBuffer<f32>> = None;
    let mut channels = 1usize;
    let mut decoded_frames: u64 = 0;

    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(EngineError::Cancelled);
        }

        let packet = match format.next_packet() {
            Ok(p) => p,
            // Both of these mean "no more packets" rather than a real failure.
            Err(SymphoniaError::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(SymphoniaError::ResetRequired) => break,
            Err(e) => return Err(decode_failed(e)),
        };
        if packet.track_id() != track_id {
            continue;
        }

        let audio = match decoder.decode(&packet) {
            Ok(a) => a,
            // A corrupt packet mid-file shouldn't lose the whole transcript;
            // skip it the way ffmpeg would.
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(decode_failed(e)),
        };

        append_mono(&audio, &mut buffer, &mut channels, &mut mono);

        decoded_frames += audio.frames() as u64;
        if total_frames > 0 {
            on_progress((decoded_frames as f64 / total_frames as f64).clamp(0.0, 1.0));
        }
    }

    if mono.is_empty() {
        return Err(EngineError::msg(
            "Could not extract any audio from this file.",
        ));
    }

    let samples = resample(&mono, source_rate, TARGET_RATE);
    let duration_ms = if duration_ms > 0 {
        duration_ms
    } else {
        // Fall back to what we actually decoded, so the player and the ETA
        // still have something to work with.
        (samples.len() as i64 * 1000) / TARGET_RATE as i64
    };

    on_progress(1.0);
    Ok(Decoded {
        samples,
        duration_ms,
    })
}

/// Average a decoded packet's channels into `out`.
fn append_mono(
    audio: &AudioBufferRef<'_>,
    buffer: &mut Option<SampleBuffer<f32>>,
    channels: &mut usize,
    out: &mut Vec<f32>,
) {
    let spec = *audio.spec();
    let capacity = audio.capacity() as u64;

    // The SampleBuffer is reused across packets; it only has to be rebuilt when
    // the stream's shape changes, which for a well-formed file is never.
    if buffer
        .as_ref()
        .map(|b| b.capacity() < audio.frames() * spec.channels.count())
        .unwrap_or(true)
    {
        *buffer = Some(SampleBuffer::<f32>::new(capacity, spec));
        *channels = spec.channels.count().max(1);
    }
    let buf = buffer.as_mut().expect("just populated");
    buf.copy_interleaved_ref(audio.clone());

    let n = *channels;
    if n == 1 {
        out.extend_from_slice(buf.samples());
    } else {
        // Downmix by averaging: whisper wants one channel, and averaging keeps
        // content that is panned hard to one side, which picking channel 0
        // would silently drop.
        let scale = 1.0 / n as f32;
        for frame in buf.samples().chunks_exact(n) {
            out.push(frame.iter().sum::<f32>() * scale);
        }
    }
}

/// Number of sinc lobes either side of the sample point. 16 is well past the
/// point where more taps change what whisper hears, and stays cheap.
const LOBES: i64 = 16;

/// Resample to `to` with a Blackman-windowed sinc filter.
///
/// Written out rather than pulled from a crate because this is the only DSP the
/// app does, and the anti-aliasing is the part that matters: going 48 kHz ->
/// 16 kHz by plain interpolation folds everything above 8 kHz back down into
/// the speech band. The cutoff therefore tracks the *lower* of the two rates.
fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }

    let ratio = to as f64 / from as f64;
    let out_len = ((input.len() as f64) * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);

    // Normalised cutoff, in cycles per input sample. Below 1.0 when
    // downsampling (the anti-alias filter), pinned at Nyquist when upsampling.
    let cutoff = if ratio < 1.0 { ratio } else { 1.0 } * 0.95;
    // A narrower cutoff means a wider impulse response, so widen the window to
    // match or the filter gets truncated into ripple.
    let half = (LOBES as f64 / cutoff).ceil() as i64;

    for i in 0..out_len {
        // Where this output sample falls on the input timeline.
        let center = i as f64 / ratio;
        let first = center.floor() as i64 - half + 1;

        let mut acc = 0.0f64;
        let mut weight = 0.0f64;
        for n in first..=(first + 2 * half) {
            if n < 0 || n as usize >= input.len() {
                continue;
            }
            let dt = center - n as f64;
            let w = blackman(dt, half as f64) * sinc(dt * cutoff) * cutoff;
            acc += input[n as usize] as f64 * w;
            weight += w;
        }
        // Normalising by the weights actually used keeps the signal level flat
        // at the very start and end, where the window runs off the array.
        out.push(if weight.abs() > 1e-9 {
            (acc / weight) as f32
        } else {
            0.0
        });
    }
    out
}

fn sinc(x: f64) -> f64 {
    if x.abs() < 1e-9 {
        1.0
    } else {
        let pix = std::f64::consts::PI * x;
        pix.sin() / pix
    }
}

fn blackman(dt: f64, half: f64) -> f64 {
    if dt.abs() > half {
        return 0.0;
    }
    let t = (dt + half) / (2.0 * half); // 0..1 across the window
    let two_pi_t = 2.0 * std::f64::consts::PI * t;
    0.42 - 0.5 * two_pi_t.cos() + 0.08 * (2.0 * two_pi_t).cos()
}

/// A codec or container symphonia can't read. Worth naming explicitly, because
/// the gap people hit first is Opus in a .webm — very common for downloaded
/// audio, and not something symphonia 0.5 decodes.
fn unsupported(e: SymphoniaError) -> EngineError {
    match e {
        SymphoniaError::Unsupported(what) => EngineError::msg(format!(
            "This file's audio format isn't supported yet ({what}). \
             MP3, AAC, M4A/MP4, FLAC, WAV, ALAC, Vorbis and Ogg all work; \
             Opus does not."
        )),
        other => decode_failed(other),
    }
}

fn decode_failed(e: SymphoniaError) -> EngineError {
    EngineError::msg(format!("Could not extract audio from this file. {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tone well inside the passband should survive resampling with its
    /// amplitude roughly intact — the check that catches a filter that is
    /// silently attenuating everything.
    #[test]
    fn preserves_a_speech_band_tone() {
        let from = 48_000;
        let freq = 440.0;
        let input: Vec<f32> = (0..from)
            .map(|i| (2.0 * std::f64::consts::PI * freq * i as f64 / from as f64).sin() as f32)
            .collect();

        let out = resample(&input, from, TARGET_RATE);

        assert_eq!(out.len(), TARGET_RATE as usize);
        // Ignore the edges, where the window runs off the array.
        let peak = out[400..out.len() - 400]
            .iter()
            .fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(peak > 0.9, "440 Hz tone was attenuated to {peak}");
    }

    /// The point of the windowed sinc: a tone above the 8 kHz output Nyquist
    /// must be filtered out, not folded back down into the speech band.
    #[test]
    fn rejects_content_above_output_nyquist() {
        let from = 48_000;
        let freq = 15_000.0; // would alias to 1 kHz if simply decimated
        let input: Vec<f32> = (0..from)
            .map(|i| (2.0 * std::f64::consts::PI * freq * i as f64 / from as f64).sin() as f32)
            .collect();

        let out = resample(&input, from, TARGET_RATE);

        let peak = out[400..out.len() - 400]
            .iter()
            .fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(peak < 0.1, "15 kHz tone aliased through at {peak}");
    }

    #[test]
    fn passes_through_when_already_16k() {
        let input = vec![0.1, -0.2, 0.3];
        assert_eq!(resample(&input, TARGET_RATE, TARGET_RATE), input);
    }
}
