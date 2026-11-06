#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-run}"
case "$mode" in run|--verify|--build) ;; *) echo 'Use --build or --verify, or omit the option to launch.' >&2; exit 2;; esac
./script/build-neural.sh
python3 script/release-build.py -p idle-control-lab
mkdir -p dist
stage=$(mktemp -d "dist/.idle-lab.XXXXXX")
trap 'rm -rf "$stage"' EXIT
bundle="$stage/Idle Control Lab.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
if [[ "$mode" != --build ]]; then pkill -x idle-control-lab || true; fi
cp target/release/idle-control-lab "$bundle/Contents/MacOS/idle-control-lab"
cp LICENSE NOTICE desktop/icons/IdleControlLab.icns "$bundle/Contents/Resources/"
cp -R third-party "$bundle/Contents/Resources/"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>idle-control-lab</string>
<key>CFBundleIdentifier</key><string>local.idlecontrol.lab</string>
<key>CFBundleName</key><string>Idle Control Lab</string>
<key>CFBundleIconFile</key><string>IdleControlLab.icns</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
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
if [[ "$mode" != --build ]]; then open -n "$bundle"; fi
if [[ "$mode" = --verify ]]; then sleep 1; pgrep -x idle-control-lab; fi
