# Transcrape on phones

The mobile apps are the same SvelteKit frontend as the web build, wrapped in
[Tauri v2](https://v2.tauri.app), with the transcription engine reimplemented in
Rust (`src-tauri/src/engine/`) — a phone can't shell out to `ffmpeg` and
`whisper-cli` the way the server build does, and iOS forbids child processes
outright. Everything still runs on the device; nothing is uploaded.

## Android — install the APK

Grab `transcrape-<version>.apk` from the
[releases page](https://github.com/morethancoder/transcribe/releases) and open
it on the phone. Android will warn about installing outside a store the first
time — that's what "allow from this source" is for. Updates install over the
old version as long as they come from the same releases page (they're signed
with the same key).

Whisper models are the same downloads as on desktop, fetched on first use into
the app's own storage. **Small** is the suggested model on a phone — see the
model table in the [README](../README.md#models) — but every model is
available; nothing is gated.

## Android — build it yourself

Requirements: Rust, Node 22+, pnpm, JDK 17+, the Android SDK with
NDK 27+ (`sdkmanager "platform-tools" "platforms;android-35"
"build-tools;35.0.0" "ndk;28.2.13676358"`), and the Android Rust targets
(`rustup target add aarch64-linux-android`).

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"      # or wherever the SDK is
export NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"
export CMAKE_ANDROID_NDK="$NDK_HOME"                 # whisper.cpp's CMake needs this one
export JAVA_HOME=…                                    # a JDK 17+

pnpm install
pnpm tauri android init                               # generates src-tauri/gen/android once
pnpm tauri icon src-tauri/icon.svg                    # put our launcher icon into it
bash scripts/android-service.sh                       # inject the background keep-alive service
bash scripts/android-sign.sh                          # wires up your signing keystore
pnpm tauri android build --apk --target aarch64       # → src-tauri/gen/android/app/build/outputs/apk/
```

`scripts/android-service.sh` copies `src-tauri/android/KeepAliveService.kt`
into the generated project and adds its manifest entries — a `dataSync`
foreground service that keeps model downloads and transcriptions running while
the app is in the background or the screen is off (without it, Android freezes
the process within moments of leaving the foreground). It has to be re-run
after any fresh `tauri android init`; CI does. Its status notification only
shows on Android 13+ once the user grants notification permission, but the
service protects the work either way.

`scripts/android-sign.sh` creates a keystore under `src-tauri/keystore/` if you
don't have one and points the Gradle build at it. That directory is gitignored:
**an APK's signing key is its identity** — phones refuse updates signed with a
different key, so keep the keystore somewhere safe and never commit it.

## iOS — why there's no download

There is no `.ipa` on the releases page, and won't be: Apple doesn't allow
installing apps from a website. The only ways onto an iPhone are the App Store,
TestFlight, enterprise profiles — all requiring a paid Apple Developer
membership — or building from source with a free Apple ID, which is what this
section covers. A free-account install is valid for **7 days**, then has to be
re-deployed from Xcode (data survives; the app just stops launching).

## iOS — build and sideload from source

Requirements: a Mac with Xcode 15+, Rust with the iOS target
(`rustup target add aarch64-apple-ios`), Node 22+, pnpm, and any Apple ID
signed into Xcode (Settings → Accounts).

```sh
pnpm install
pnpm tauri ios init          # generates src-tauri/gen/apple once
pnpm tauri ios dev           # builds, then deploys to a connected device or simulator
```

For a device rather than the simulator:

1. Open `src-tauri/gen/apple/transcrape.xcodeproj` in Xcode.
2. Select the `transcrape_iOS` target → Signing & Capabilities → tick
   **Automatically manage signing** and pick your personal team. Xcode may make
   you change the bundle identifier to something unique — fine.
3. Plug in the iPhone, select it as the destination, press Run.
4. First launch only: on the phone, Settings → General → VPN & Device
   Management → trust your developer certificate.

Models download on first use exactly as everywhere else. Storage note: iOS
keeps the models in the app's Application Support (backed up) and decoded audio
in Caches (purgeable), so an offloaded or storage-squeezed phone loses cached
audio before it loses a 190 MB model.

## What's different from the desktop app

- **Opus doesn't decode.** The in-process decoder (symphonia) covers MP3, AAC,
  M4A/MP4, FLAC, WAV, ALAC, Vorbis and Ogg — but not Opus, which is what's
  inside most `.webm` downloads. The server build doesn't have this limit
  because ffmpeg does its decoding. Planned; tracked in the issues.
- **Picking a file uses the system picker**, and on Android the file's true
  name may not survive the trip (content URIs are opaque). The transcript is
  unaffected.
- The engine runs on CPU (with the platform's accelerated BLAS). Turbo on a
  phone works but is slow — that's what the model picker's suggestions are for.
