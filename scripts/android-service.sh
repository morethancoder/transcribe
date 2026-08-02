#!/usr/bin/env bash
# Inject the background keep-alive service into the generated Android project.
#
# `tauri android init` writes gen/android from Tauri's template, and CI runs it
# fresh on every release build — so the service class and its manifest entries
# can't be edited into gen/android by hand; they have to be re-applied after
# every init. Run this after `pnpm tauri android init` (CI does), and it's
# idempotent, so running it twice is harmless.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh

MANIFEST=src-tauri/gen/android/app/src/main/AndroidManifest.xml
PKG_DIR=src-tauri/gen/android/app/src/main/java/com/morethancoder/transcribe

[ -f "$MANIFEST" ] || {
  err "no generated Android project — run: pnpm tauri android init"
  exit 1
}

step "Injecting KeepAliveService into gen/android"

mkdir -p "$PKG_DIR"
cp src-tauri/android/KeepAliveService.kt "$PKG_DIR/"
ok "KeepAliveService.kt"

# dataSync foreground service + the wakelock it holds. POST_NOTIFICATIONS is
# for its status notification on Android 13+ — the service runs either way,
# the notification is just invisible until the user grants it.
if ! grep -q FOREGROUND_SERVICE_DATA_SYNC "$MANIFEST"; then
  perl -0pi -e 's|(\n\s*<application)|\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.WAKE_LOCK" />$1|' "$MANIFEST"
fi
if ! grep -q KeepAliveService "$MANIFEST"; then
  perl -0pi -e 's|(\s*</application>)|\n        <service android:name=".KeepAliveService" android:exported="false" android:foregroundServiceType="dataSync" />$1|' "$MANIFEST"
fi

grep -q FOREGROUND_SERVICE_DATA_SYNC "$MANIFEST" && grep -q KeepAliveService "$MANIFEST" || {
  err "manifest patch did not take — check $MANIFEST"
  exit 1
}
ok "AndroidManifest.xml (permissions + service)"
