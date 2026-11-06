#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-run}"
case "$mode" in run|--verify|--build|--universal) ;; *) echo 'Use --build, --universal or --verify, or omit the option to launch.' >&2; exit 2;; esac
version=$(cargo metadata --locked --no-deps --format-version 1 | python3 -c 'import json,sys; print(next(p["version"] for p in json.load(sys.stdin)["packages"] if p["name"]=="idle-control-lab"))')
if [[ "$mode" == --universal ]]; then
  for arch in aarch64 x86_64; do
    python3 script/release-build.py -p idle-control-lab --target "$arch-apple-darwin"
  done
else
  ./script/build-neural.sh
  python3 script/release-build.py -p idle-control-lab
fi
mkdir -p dist
stage=$(mktemp -d "dist/.idle-lab.XXXXXX")
trap 'rm -rf "$stage"' EXIT
bundle="$stage/Idle Control Lab.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
if [[ "$mode" == --universal ]]; then
  lipo -create target/{aarch64,x86_64}-apple-darwin/release/idle-control-lab -output "$bundle/Contents/MacOS/idle-control-lab"
  python3 packaging/notices.py "$bundle/Contents/Resources/third-party" aarch64-apple-darwin x86_64-apple-darwin
else
  cp target/release/idle-control-lab "$bundle/Contents/MacOS/idle-control-lab"
fi
cp LICENSE NOTICE desktop/icons/IdleControlLab.icns "$bundle/Contents/Resources/"
mkdir -p "$bundle/Contents/Resources/third-party"
cp -R third-party/. "$bundle/Contents/Resources/third-party/"
cat > "$bundle/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>idle-control-lab</string>
<key>CFBundleIdentifier</key><string>local.idlecontrol.lab</string>
<key>CFBundleName</key><string>Idle Control Lab</string>
<key>CFBundleIconFile</key><string>IdleControlLab.icns</string>
<key>CFBundleVersion</key><string>$version</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
codesign --force --sign - "$bundle"
codesign --verify --strict "$bundle"
destination="dist/Idle Control Lab.app"
if [[ -d "$destination" ]]; then mv "$destination" "$stage/previous.app"; fi
if ! mv "$bundle" "$destination"; then
  if [[ -d "$stage/previous.app" ]]; then mv "$stage/previous.app" "$destination"; fi
  exit 1
fi
bundle="$destination"
if [[ "$mode" == run || "$mode" == --verify ]]; then
  pkill -x idle-control-lab || true
  open -n "$bundle"
fi
if [[ "$mode" = --verify ]]; then sleep 1; pgrep -x idle-control-lab; fi
