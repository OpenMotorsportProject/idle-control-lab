#!/usr/bin/env python3
"""Refresh the checked-in exports after editing icons/idle-control.svg (macOS, Pillow)."""
from pathlib import Path
import subprocess
import tempfile

from PIL import Image

root = Path(__file__).resolve().parent.parent
icons = root / "icons"
native = root / "desktop" / "icons"
native.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as scratch:
    png = Path(scratch) / "master.png"
    subprocess.run(["sips", "-s", "format", "png", str(icons / "idle-control.svg"),
                    "--out", str(png)], check=True, stdout=subprocess.DEVNULL)
    with Image.open(png) as source:
        master = source.convert("RGBA")
    scale = Image.Resampling.LANCZOS

    # Tao accepts RGBA pixels directly on Linux and Windows.
    (native / "window-64.rgba").write_bytes(master.resize((64, 64), scale).tobytes())

    # Home-screen icons receive their corner mask from the OS.
    touch = Image.new("RGBA", master.size, "#183b32")
    touch.alpha_composite(master)
    touch.resize((180, 180), scale).convert("RGB").save(icons / "apple-touch-icon.png", optimize=True)

    # Leave space around the tile to align it with other icons in the Dock.
    dock = Image.new("RGBA", (1024, 1024))
    dock.alpha_composite(master.resize((880, 880), scale), (72, 72))
    iconset = Path(scratch) / "IdleControlLab.iconset"
    iconset.mkdir()
    for points in (16, 32, 128, 256, 512):
        for density, suffix in ((1, ""), (2, "@2x")):
            size = points * density
            dock.resize((size, size), scale).save(iconset / f"icon_{points}x{points}{suffix}.png")
    subprocess.run(["iconutil", "-c", "icns", "-o", str(native / "IdleControlLab.icns"),
                    str(iconset)], check=True)
