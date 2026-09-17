#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

EXPECTED_SHA256 = "75acd8c117c774ed4f671b4407a6cacd8f7242034e64e78f103cc69aead9bc9e"


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    corporate = root / "corporate"
    encoded = "".join(
        (corporate / f"patch.part{i}.b64").read_text(encoding="ascii").strip()
        for i in range(1, 5)
    )
    payload = base64.b64decode(encoded, validate=True)
    digest = hashlib.sha256(payload).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"corporate patch checksum mismatch: {digest}")

    with tempfile.TemporaryDirectory(prefix="bibo-corporate-") as tmp:
        tmp_path = Path(tmp)
        archive = tmp_path / "patch.zip"
        archive.write_bytes(payload)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(tmp_path)
        patcher = tmp_path / "patch" / "apply.py"
        subprocess.check_call([sys.executable, str(patcher), str(root)])


if __name__ == "__main__":
    main()
