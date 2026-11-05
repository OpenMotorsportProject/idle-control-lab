#!/usr/bin/env python3
"""Compile release targets with source paths remapped in diagnostics and panic strings."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip())
home = Path.home()
# rustc uses the last matching prefix. Put more specific roots last.
mapping = [(home, "/builder"), (Path(os.environ.get("CARGO_HOME", home / ".cargo")), "/cargo"),
           (sysroot, "/rust"), (root, "/src/idle-control-lab")]
flags = os.environ.get("CARGO_ENCODED_RUSTFLAGS")
if flags is None and os.environ.get("RUSTFLAGS"):
    flags = "\x1f".join(os.environ["RUSTFLAGS"].split())
args = flags.split("\x1f") if flags else []
for path, dest in mapping:
    args.append(f"--remap-path-prefix={path}={dest}")
env = dict(os.environ, CARGO_ENCODED_RUSTFLAGS="\x1f".join(args))
subprocess.run(["cargo", "build", "--release", "--locked", *sys.argv[1:]], cwd=root,
               env=env, check=True)
