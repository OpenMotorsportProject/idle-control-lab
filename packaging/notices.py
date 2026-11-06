"""Assemble target-specific notices from the crates used by the locked desktop build."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tomllib

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
third_party = root / "third-party"
for file in third_party.iterdir():
    if file.is_file():
        shutil.copy2(file, out / file.name)


def cargo(*args):
    return subprocess.check_output(["cargo", *args], cwd=root, text=True, encoding="utf-8")


packages = {(p["name"], p["version"]): p for p in json.loads(
    cargo("metadata", "--locked", "--format-version", "1"))["packages"]}
used = set()
for target in sys.argv[2:]:
    tree = cargo("tree", "--locked", "-p", "idle-control-lab", "--target", target,
                 "--edges", "normal,build", "--prefix", "none", "--format", "{p}")
    for line in tree.splitlines():
        name, version, *_ = line.split()
        used.add((name, version.removeprefix("v")))

fallbacks = {
    "https://github.com/madsmtm/objc2": "objc2.md",
    "https://github.com/OpenByteDev/dlopen2": "dlopen2.txt",
    "https://github.com/wravery/webview2-rs": "webview2-rs.txt",
}
lock_packages = tomllib.loads((root / "Cargo.lock").read_text())["package"]
licenses = root / "packaging/licenses"
with (out / "DESKTOP-NOTICES.txt").open("w", encoding="utf-8") as report:
    report.write("Idle Control Lab desktop dependencies (including build dependencies)\n")
    for name, version in sorted(used):
        pkg = packages[name, version]
        if pkg["source"] is None:
            continue
        base = Path(pkg["manifest_path"]).parent
        report.write(f"\n{'=' * 72}\n{name} {version} | {pkg['license']}\n")
        report.write(f"Source: https://crates.io/api/v1/crates/{name}/{version}/download\n")
        report.write(f"Authors: {', '.join(pkg['authors'])}\n")
        files = [p for p in base.rglob("*") if p.is_file() and
                 any(re.match(r"^(licen[cs]e|copying|notice|copyright)([. _-]|s$|$)", part, re.I)
                     for part in p.relative_to(base).parts)]
        if pkg["license_file"]:
            files.append(base / pkg["license_file"])
        if not files:
            files = [licenses / fallbacks[pkg["repository"]]]
            if files[0].name == "objc2.md":
                # Upstream links to the standard MIT terms. Include that text as well.
                files.append(third_party / "Rust-MIT.txt")
        for file in sorted(set(files)):
            report.write(f"\n{file.name}\n{file.read_text(encoding='utf-8-sig')}\n")
        if "MPL-2.0" in (pkg["license"] or ""):
            archive = base.parents[2] / "cache" / base.parent.name / f"{name}-{version}.crate"
            locked = next(p for p in lock_packages if p["name"] == name and p["version"] == version)
            assert hashlib.sha256(archive.read_bytes()).hexdigest() == locked["checksum"]
            sources = out / "MPL-sources"
            sources.mkdir(exist_ok=True)
            shutil.copy2(archive, sources / archive.name)
        if name == "webview2-com-sys":
            loader = base / "x64/WebView2LoaderStatic.lib"
            if hashlib.sha256(loader.read_bytes()).hexdigest() != "89c6b872783b8f6c3cedbff618adb42082d455c615453ae10cfc753f1e8f25d8":
                raise ValueError("Update the WebView2 SDK notices for this loader")
            for notice in licenses.glob("WebView2-SDK-*.txt"):
                shutil.copy2(notice, out / notice.name)
print(f"Collected notices for {len(used) - 1} external packages.")
