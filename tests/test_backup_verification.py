import hashlib
import io
import runpy
import tarfile
import tempfile
import unittest
from pathlib import Path


verify = runpy.run_path(str(Path(__file__).resolve().parents[1] / "deploy" / "verify-backup.py"))["verify_backup"]
UPLOAD_ID = "c6a7771c-e6db-4537-9acf-fb1497e6b2fe"


class BackupVerificationTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.dump = self.directory / "database.dump"
        self.uploads = self.directory / "uploads.tar.gz"
        self.sums = self.directory / "SHA256SUMS"
        self.dump.write_bytes(b"PGDMP-fixture")
        (self.directory / "manifest.json").write_text('{"format":"smee-vps-backup","version":1}', encoding="ascii")
        self.archive_with_uploads("./" + UPLOAD_ID)

    def archive_with_uploads(self, *names):
        with tarfile.open(self.uploads, "w:gz") as tar:
            root = tarfile.TarInfo(".")
            root.type = tarfile.DIRTYPE
            tar.addfile(root)
            for name in names:
                record = tarfile.TarInfo(name)
                record.size = 3
                tar.addfile(record, io.BytesIO(b"123"))
        self.refresh_checksums()

    def refresh_checksums(self):
        lines = []
        for name in ("database.dump", "uploads.tar.gz", "manifest.json"):
            digest = hashlib.sha256((self.directory / name).read_bytes()).hexdigest()
            lines.append(f"{digest}  {name}\n")
        self.sums.write_text("".join(lines), encoding="ascii")

    def test_existing_and_empty_backup(self):
        self.assertEqual(verify(self.directory), 1)
        self.archive_with_uploads()
        self.assertEqual(verify(self.directory), 0)

    def test_corrupt_dump(self):
        self.dump.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
            verify(self.directory)
        self.refresh_checksums()
        with self.assertRaisesRegex(ValueError, "custom-format"):
            verify(self.directory)

    def test_missing_checksum(self):
        self.sums.write_text(self.sums.read_text().splitlines()[0] + "\n", encoding="ascii")
        with self.assertRaisesRegex(ValueError, "Missing checksum"):
            verify(self.directory)

    def test_duplicate_upload(self):
        self.archive_with_uploads(UPLOAD_ID, "./" + UPLOAD_ID)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            verify(self.directory)

    def test_unexpected_archive_name(self):
        self.archive_with_uploads("unrelated.txt")
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            verify(self.directory)

    def test_incomplete_gzip(self):
        self.uploads.write_bytes(self.uploads.read_bytes()[:-4])
        self.refresh_checksums()
        with self.assertRaises(EOFError):
            verify(self.directory)


if __name__ == "__main__":
    unittest.main()
