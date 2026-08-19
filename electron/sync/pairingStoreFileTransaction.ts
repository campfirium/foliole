import fs from 'node:fs';
import path from 'node:path';

export type PairingStoreFileSnapshot = Buffer | null;

export function snapshotPairingStoreFile(storePath: string): PairingStoreFileSnapshot {
  return fs.existsSync(storePath) ? fs.readFileSync(storePath) : null;
}

export function writePairingStoreFile(storePath: string, contents: Buffer) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, { mode: 0o600 });
    fs.renameSync(temporaryPath, storePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function restorePairingStoreFile(storePath: string, snapshot: PairingStoreFileSnapshot) {
  if (snapshot) writePairingStoreFile(storePath, snapshot);
  else fs.rmSync(storePath, { force: true });
}
