"""Verify a version 1 SMEE backup locally without database access or extraction."""

import hashlib
import gzip
import json
import re
import sys
import tarfile
from pathlib import Path


REQUIRED = {"database.dump", "uploads.tar.gz", "manifest.json"}
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
UPLOAD_NAME = re.compile(rf"(?:{UUID}|\.{UUID}\.tmp)")


def verify_backup(directory):
    for name in REQUIRED | {"SHA256SUMS"}:
        path = directory / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Missing regular file: {name}")

    checked = set()
    for line in (directory / "SHA256SUMS").read_text(encoding="ascii").splitlines():
        entry = re.fullmatch(r"([0-9a-f]{64}) [ *]([^/\\]+)", line)
        if not entry or entry[2] not in REQUIRED or entry[2] in checked:
            raise ValueError("Unexpected checksum entry")
        digest, name = entry.groups()
        actual = hashlib.sha256()
        with (directory / name).open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                actual.update(block)
        if actual.hexdigest() != digest:
            raise ValueError(f"Checksum mismatch: {name}")
        checked.add(name)
    if checked != REQUIRED:
        raise ValueError("Missing checksum for a required backup file")

    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("format") != "smee-vps-backup" or manifest.get("version") != 1:
        raise ValueError("Unsupported backup format")
    with (directory / "database.dump").open("rb") as dump:
        if dump.read(5) != b"PGDMP":
            raise ValueError("Expected a PostgreSQL custom-format dump")

    filenames = set()
    with gzip.open(directory / "uploads.tar.gz", "rb") as unpacked:
        with tarfile.open(fileobj=unpacked, mode="r|") as archive:
            for member in archive:
                if member.isdir() and member.name in (".", "./"):
                    continue
                name = member.name.removeprefix("./")
                if not member.isfile() or not UPLOAD_NAME.fullmatch(name) or name in filenames:
                    raise ValueError("Unexpected or duplicate upload entry")
                if not 0 <= member.size <= 10 * 1024 * 1024:
                    raise ValueError("Unexpected upload size")
                filenames.add(name)
        # Read through the gzip trailer even if tar's end marker was reached early.
        while unpacked.read(1024 * 1024):
            pass
    return len(filenames)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 deploy/verify-backup.py /path/to/backup-directory")
    try:
        count = verify_backup(Path(sys.argv[1]))
    except (OSError, ValueError, EOFError, tarfile.TarError) as error:
        sys.exit(f"Backup verification failed: {error}")
    print(f"Backup checksums and archive verified ({count} upload entries).")
