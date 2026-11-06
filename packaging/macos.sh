#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_VERSION:?}"
rustup target add aarch64-apple-darwin x86_64-apple-darwin
./script/build_and_run.sh --universal
archive="dist/idle-control-lab-$RELEASE_VERSION-macos-universal.zip"
ditto -c -k --keepParent "dist/Idle Control Lab.app" "$archive"
unpacked=$(mktemp -d)
trap 'rm -rf "$unpacked"' EXIT
ditto -x -k "$archive" "$unpacked"
app="$unpacked/Idle Control Lab.app"
binary="$app/Contents/MacOS/idle-control-lab"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$app/Contents/Info.plist")" = "$RELEASE_VERSION"
codesign --verify --strict --deep "$app"
lipo -verify_arch arm64 x86_64 "$binary"
for arch in arm64 x86_64; do
  if /usr/bin/arch "-$arch" /usr/bin/true; then
    /usr/bin/arch "-$arch" "$binary" & pid=$!
    sleep 5
    kill -0 "$pid"
    kill "$pid"
    wait "$pid" || true
    echo "Launched the packaged $arch slice."
  fi
done
