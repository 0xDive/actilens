#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("usage: scripts/set-version.py X.Y.Z")

version = sys.argv[1].strip()
if version.startswith("v"):
    version = version[1:]
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?", version):
    raise SystemExit(f"invalid version: {version}")

root = Path(__file__).resolve().parents[1]

for rel in ["apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json"]:
    path = root / rel
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = version
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

cargo = root / "apps/desktop/src-tauri/Cargo.toml"
text = cargo.read_text(encoding="utf-8")
updated, count = re.subn(
    r'(?m)^(version\s*=\s*)"[^"]+"',
    rf'\1"{version}"',
    text,
    count=1,
)
if count != 1:
    raise SystemExit("could not update package version in Cargo.toml")
cargo.write_text(updated, encoding="utf-8")

print(f"ActiLens version set to {version}")
