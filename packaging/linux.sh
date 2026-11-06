#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_VERSION:?}"
python3 script/release-build.py -p idle-control-lab
out="$PWD/dist"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pkg="$work/pkg"
docs="$pkg/usr/share/doc/idle-control-lab"
mkdir -p "$out" "$pkg/DEBIAN" "$docs" "$work/debian"
install -Dm755 target/release/idle-control-lab "$pkg/usr/bin/idle-control-lab"
install -Dm644 icons/idle-control.svg "$pkg/usr/share/icons/hicolor/scalable/apps/idle-control-lab.svg"
install -Dm644 packaging/idle-control-lab.desktop "$pkg/usr/share/applications/idle-control-lab.desktop"
install -m644 LICENSE "$docs/copyright"
install -m644 NOTICE "$docs/NOTICE"
python3 packaging/notices.py "$docs/third-party" x86_64-unknown-linux-gnu
cat > "$work/debian/control" <<'CONTROL'
Source: idle-control-lab
Section: science
Priority: optional
Maintainer: OpenMotorsportProject <218479541+OpenMotorsportProject@users.noreply.github.com>

Package: idle-control-lab
Architecture: amd64
Description: Offline automotive idle control and neural dynamics lab
CONTROL
libs=$(cd "$work" && dpkg-shlibdeps -O -e"$pkg/usr/bin/idle-control-lab")
sed -n '/^Package:/,$p' "$work/debian/control" > "$pkg/DEBIAN/control"
cat >> "$pkg/DEBIAN/control" <<CONTROL
Version: $RELEASE_VERSION
Maintainer: OpenMotorsportProject <218479541+OpenMotorsportProject@users.noreply.github.com>
Depends: ${libs#shlibs:Depends=}
Recommends: xdg-utils
CONTROL
archive="$out/idle-control-lab_${RELEASE_VERSION}_amd64.deb"
dpkg-deb --root-owner-group --build "$pkg" "$archive"
dpkg-deb --info "$archive"
sudo apt-get install -y "$archive"
test "$(dpkg-query -W -f='${Version}' idle-control-lab)" = "$RELEASE_VERSION"
dbus-run-session -- xvfb-run -a env GTK_MODULES=gail:atk-bridge NO_AT_BRIDGE=0 GDK_BACKEND=x11 \
  bash -ec '/usr/bin/idle-control-lab & app=$!; trap "kill $app 2>/dev/null || true" EXIT; /usr/bin/python3 packaging/linux-smoke.py'
