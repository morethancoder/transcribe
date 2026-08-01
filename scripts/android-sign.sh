#!/usr/bin/env bash
# Wire the Android build up to a release keystore.
#
# Tauri generates src-tauri/gen/android from a template that only knows debug
# signing, and gen/ is gitignored — so this wiring has to be reapplied after
# any `tauri android init`. Idempotent: run it as often as you like.
#
#   1. Ensures src-tauri/keystore/ holds a keystore + keystore.properties,
#      creating both on first run (CI instead restores them from secrets).
#   2. Writes gen/android/keystore.properties pointing at that keystore.
#   3. Patches gen/android/app/build.gradle.kts to sign release builds with it.
#
# The keystore directory is gitignored on purpose: the signing key is the app's
# identity — phones refuse to update an app whose key changed — so it must
# never enter git, and losing it means every user reinstalls from scratch.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh

KEYSTORE_DIR=src-tauri/keystore
KEYSTORE=$KEYSTORE_DIR/transcrape-release.jks
PROPS=$KEYSTORE_DIR/keystore.properties
GEN=src-tauri/gen/android
GRADLE=$GEN/app/build.gradle.kts

[ -d "$GEN" ] || { err "no $GEN — run 'pnpm tauri android init' first"; exit 1; }

# --- 1. keystore ------------------------------------------------------------
if [ ! -f "$KEYSTORE" ]; then
  step "creating a release keystore ($KEYSTORE)"
  command -v keytool >/dev/null 2>&1 || { err "keytool not found — install a JDK"; exit 1; }
  PASS=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  mkdir -p "$KEYSTORE_DIR"
  keytool -genkeypair -keystore "$KEYSTORE" -alias transcrape -keyalg RSA \
    -keysize 4096 -validity 10000 -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=Transcrape, O=morethancoder" >/dev/null 2>&1
  printf 'keyAlias=transcrape\npassword=%s\n' "$PASS" > "$PROPS"
  chmod 600 "$PROPS"
  warn "new keystore generated — back up $KEYSTORE_DIR somewhere safe"
else
  ok "keystore exists ($KEYSTORE)"
fi

# --- 2. point gradle at it --------------------------------------------------
# gen/android/keystore.properties is what the gradle snippet below reads.
# storeFile is written absolute: gradle's file() resolves relative paths
# against whichever module evaluates them (app/, not the project root), which
# is exactly the sort of off-by-one this file doesn't need — it is regenerated
# per machine and never committed, so an absolute path costs nothing.
{
  cat "$PROPS"
  printf 'storeFile=%s\n' "$(cd "$KEYSTORE_DIR" && pwd)/transcrape-release.jks"
} > "$GEN/keystore.properties"
ok "wrote $GEN/keystore.properties"

# --- 3. patch build.gradle.kts ----------------------------------------------
if grep -q 'signingConfigs' "$GRADLE"; then
  ok "build.gradle.kts already patched"
else
  step "patching $GRADLE for release signing"
  python3 - "$GRADLE" <<'EOF'
import re, sys
path = sys.argv[1]
src = open(path).read()

if "java.util.Properties" not in src:
    src = "import java.util.Properties\n" + src

signing = """    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(keystorePropertiesFile.inputStream())
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
"""

# inside android { }, before buildTypes
src = src.replace("    buildTypes {", signing + "    buildTypes {", 1)

# make the release build type use it
src = re.sub(
    r'(getByName\("release"\) \{)',
    r'\1\n            signingConfig = signingConfigs.getByName("release")',
    src,
    count=1,
)

open(path, "w").write(src)
EOF
  grep -q 'signingConfig = signingConfigs.getByName("release")' "$GRADLE" \
    && ok "release builds now sign with $KEYSTORE" \
    || { err "patch did not land — inspect $GRADLE"; exit 1; }
fi
