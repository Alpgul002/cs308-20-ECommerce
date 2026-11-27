import { unlinkSync } from "node:fs";
import { basename, dirname } from "node:path";
import { tmpdir } from "node:os";
export default function cleanup() {
  const file = process.env.E2E_DB_FILE;
  if (!file || dirname(file) !== tmpdir() || !/^orbit-e2e-[a-f0-9-]+\.sqlite$/.test(basename(file))) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(file + suffix); } catch { /* The server may still own the file on Windows. */ }
  }
}
