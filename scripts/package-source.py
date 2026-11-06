from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
excluded = {"node_modules", ".git", "dist", "test-results", "playwright-report"}
files = sorted(p for p in root.rglob("*") if p.is_file()
               and not any(part in excluded for part in p.relative_to(root).parts)
               and not p.name.startswith(".env")
               and p.name != "SOURCE-MANIFEST.json")
manifest = {"files": [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size,
                       "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
path = root / "SOURCE-MANIFEST.json"
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
files.append(path)
archive = root.parent / "ayumi-draft-source.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for p in files:
        z.write(p, str(Path(root.name) / p.relative_to(root)))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(root.parent / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n")
print(f"Packaged {len(files)} files: {archive.name} ({archive.stat().st_size} bytes)")
