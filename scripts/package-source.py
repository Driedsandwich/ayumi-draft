from pathlib import Path
import hashlib
import json
import os
import stat
import subprocess
import tempfile
import zipfile

# 配布ZIPには git で追跡している通常ファイルだけを入れる。
# 秘密用の名前が追跡されていたり、リンクが混ざっていたりすれば作らずに止める。
SOURCE_SKIP = {"node_modules", ".git", "dist", "test-results", "playwright-report"}
SECRET_NAMES = {".vercel", ".aws", ".ssh", ".netrc", ".npmrc.private", "id_rsa", "id_ed25519"}
SECRET_SUFFIXES = (".pem", ".key", ".p12", ".pfx")
MANIFEST = Path("SOURCE-MANIFEST.json")


def tracked_files(root):
    entries = subprocess.check_output(["git", "ls-files", "--stage", "-z"], cwd=root)
    files = []
    for entry in entries.split(b"\0")[:-1]:
        header, name = entry.split(b"\t", 1)
        mode, _, stage = header.split()
        path = Path(os.fsdecode(name))
        parts = [part.lower() for part in path.parts]
        if any(part.startswith(".env") or part in SECRET_NAMES or part.endswith(SECRET_SUFFIXES) for part in parts):
            raise ValueError(f"秘密用の名前が追跡されています ({path})")
        if mode not in {b"100644", b"100755"} or stage != b"0":
            raise ValueError(f"配布できる通常ファイルではありません ({path})")
        current = root
        for part in path.parts[:-1]:
            current = current / part
            if not stat.S_ISDIR(current.lstat().st_mode):
                raise ValueError(f"配布できるディレクトリではありません ({current.relative_to(root)})")
        if not stat.S_ISREG((root / path).lstat().st_mode):
            raise ValueError(f"配布できる通常ファイルではありません ({path})")
        files.append(path)
    return sorted(files)


def package(root):
    source = [p for p in tracked_files(root) if p != MANIFEST and not SOURCE_SKIP.intersection(p.parts)]
    base = root.parent
    archive = base / "ayumi-draft-source.zip"
    manifest = {"files": []}
    with tempfile.TemporaryDirectory(dir=base) as temporary:
        staged = Path(temporary) / archive.name
        with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as z:
            for path in source:
                data = (root / path).read_bytes()
                manifest["files"].append({"path": path.as_posix(), "bytes": len(data),
                                          "sha256": hashlib.sha256(data).hexdigest()})
                z.writestr(zipfile.ZipInfo.from_file(root / path, f"{root.name}/{path.as_posix()}"),
                           data, zipfile.ZIP_DEFLATED)
            z.writestr(f"{root.name}/{MANIFEST}", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        staged.replace(archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (base / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n")
    print(f"Packaged {len(source) + 1} files: {archive.name} ({archive.stat().st_size} bytes)")


if __name__ == "__main__":
    try:
        package(Path(__file__).resolve().parents[1])
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"配布ZIPを作成できません ({exc})") from exc
