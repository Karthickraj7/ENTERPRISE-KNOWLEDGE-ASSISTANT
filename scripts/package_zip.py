#!/usr/bin/env python3
"""Package the clean repository into enterprise-knowledge-assistant.zip."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_DIRS = {"__pycache__", "node_modules", ".next", ".venv", "venv", "var", ".pytest_cache", ".mypy_cache", ".git"}
EXCLUDED_FILES = {".env", ".DS_Store"}


def create_archive(output_path: Path) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in sorted(ROOT.rglob("*")):
            if not item.is_file():
                continue
            rel = item.relative_to(ROOT)
            if any(part in EXCLUDED_DIRS for part in rel.parts):
                continue
            if item.name in EXCLUDED_FILES or item.suffix in (".pyc", ".pyo", ".db", ".sqlite"):
                continue
            arcname = f"enterprise-knowledge-assistant/{rel.as_posix()}"
            zf.write(item, arcname=arcname)
            count += 1
    return count


if __name__ == "__main__":
    out = ROOT.parent / "enterprise-knowledge-assistant.zip"
    n = create_archive(out)
    print(f"Created {out} with {n} files.")
