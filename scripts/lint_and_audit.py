#!/usr/bin/env python3
"""Static security audit, secret scanner, and Python syntax compilation verifier."""
from pathlib import Path
import py_compile
import re
import sys

ROOT = Path(__file__).resolve().parent.parent

SECRET_PATTERNS = [
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "Google API Key"),
    (re.compile(r"sk-[A-Za-z0-9]{32,}"), "OpenAI Secret Key"),
    (re.compile(r"sk-ant-[A-Za-z0-9\-_]{32,}"), "Anthropic Secret Key"),
    (re.compile(r"-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----"), "Private Key"),
]


def main() -> int:
    py_files = list((ROOT / "backend").rglob("*.py")) + list((ROOT / "scripts").rglob("*.py"))
    for pf in py_files:
        py_compile.compile(str(pf), doraise=True)

    scanned = 0
    for fpath in ROOT.rglob("*"):
        if not fpath.is_file():
            continue
        if any(part in fpath.parts for part in (".git", "__pycache__", "node_modules", ".next", "var")):
            continue
        if fpath.suffix.lower() in (".pdf", ".docx", ".png", ".jpg", ".zip", ".db", ".sqlite"):
            continue
        text = fpath.read_text(encoding="utf-8", errors="ignore")
        scanned += 1
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(text):
                print(f"FAIL: Detected potential {label} in {fpath.relative_to(ROOT)}")
                return 1

    print(f"PASS: Compiled {len(py_files)} Python modules and scanned {scanned} source files (0 leaked secrets).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
