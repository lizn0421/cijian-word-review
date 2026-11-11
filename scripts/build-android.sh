#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
tools="${ANDROID_BUILD_TOOLS:-$sdk/build-tools/35.0.0}"
platform="${ANDROID_PLATFORM_JAR:-$sdk/platforms/android-35/android.jar}"
output="${1:-$root/build/cijian-v1.0.0.apk}"
key="${CIJIAN_KEYSTORE:-$root/build/cijian-debug.jks}"
mkdir -p "$(dirname "$output")" "$(dirname "$key")"
output="$(realpath -m "$output")"
key="$(realpath -m "$key")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/classes" "$work/dex" "$work/assets/web"
cp "$root/web/"* "$work/assets/web/"
src="$root/android/src/main"
javac -encoding UTF-8 --release 8 -classpath "$platform" -d "$work/classes" \
  "$src/java/com/cijian/study/MainActivity.java"
jar cf "$work/classes.jar" -C "$work/classes" .
"$tools/d8" --min-api 23 --lib "$platform" --output "$work/dex" "$work/classes.jar"
"$tools/aapt2" compile --dir "$src/res" -o "$work/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest "$src/AndroidManifest.xml" \
  -A "$work/assets" -o "$work/unsigned.apk" "$work/resources.zip"
(cd "$work/dex" && zip -q -j -0 "$work/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"
if [[ ! -f "$key" ]]; then
  keytool -genkeypair -keystore "$key" -alias cijian -storepass android -keypass android \
    -dname "CN=Cijian Debug" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null
  chmod 600 "$key"
fi
"$tools/apksigner" sign --ks "$key" --ks-key-alias cijian --ks-pass pass:android \
  --key-pass pass:android --out "$output" "$work/aligned.apk"
"$tools/apksigner" verify --min-sdk-version 23 --verbose "$output"
rm -f "$output.idsig"
