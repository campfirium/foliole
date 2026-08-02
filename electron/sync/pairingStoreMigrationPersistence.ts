import fs from 'node:fs';

const LEGACY_MAS_BACKUP_SUFFIX = '.legacy-mas-safe-storage';

function ensureBackupMatches(backupPath: string, original: Buffer) {
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, original, { flag: 'wx', mode: 0o600 });
    return;
  }
  if (!fs.readFileSync(backupPath).equals(original)) {
    throw new Error('Legacy MAS paired-device backup already exists with different content.');
  }
}

export function persistMigratedPairingStore(args: {
  encrypted: Buffer;
  original: Buffer;
  storePath: string;
}) {
  const backupPath = `${args.storePath}${LEGACY_MAS_BACKUP_SUFFIX}`;
  const temporaryPath = `${args.storePath}.migration-${process.pid}`;
  ensureBackupMatches(backupPath, args.original);
  try {
    fs.writeFileSync(temporaryPath, args.encrypted, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporaryPath, args.storePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
  return backupPath;
}
