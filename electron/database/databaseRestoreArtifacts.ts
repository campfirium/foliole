import { promises as fs } from 'node:fs';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { discardRestoreSafetySnapshot, settleRestoreSafetySnapshots } from './backupSafetyRetention.js';
import { materializeCompressedSqliteBackup } from './compressedSqliteBackup.js';
import type { ManagedSafetySnapshot } from './managedSafetySnapshots.js';

export function createDatabaseRestoreArtifacts() {
  const temporaryPaths = new Set<string>();
  const cleanups: Array<() => Promise<void>> = [];
  let recoveryFailed = false;
  const finishTemporary = async () => {
    if (!recoveryFailed) await Promise.all(cleanups.map((cleanup) => cleanup()));
  };
  return {
    finishTemporary,
    async materialize(sourcePath: string, directory: string) {
      const materialized = await materializeCompressedSqliteBackup(sourcePath, directory);
      if (materialized.databasePath !== sourcePath) temporaryPaths.add(materialized.databasePath);
      cleanups.push(materialized.cleanup);
      return materialized.databasePath;
    },
    trackCandidate(databasePath: string) {
      temporaryPaths.add(databasePath);
      cleanups.push(async () => {
        await Promise.all(['', '-journal', '-shm', '-wal'].map((suffix) =>
          fs.rm(`${databasePath}${suffix}`, { force: true })));
      });
    },
    preserve() {
      recoveryFailed = true;
    },
    async finish(args: {
      backupDirectory: string;
      replacementComplete: boolean;
      settings: NativeBackupSettings;
      snapshot: ManagedSafetySnapshot | null;
      sourcePath: string;
    }) {
      if (recoveryFailed) {
        args.snapshot?.release();
        console.error('[backup] retaining files after failed database recovery', {
          sourcePath: args.sourcePath,
          safetySnapshotPath: args.snapshot?.currentPath,
          temporaryPaths: [...temporaryPaths]
        });
        return;
      }
      await finishTemporary();
      if (!args.snapshot) return;
      if (args.replacementComplete) {
        await settleRestoreSafetySnapshots(args.snapshot, args.sourcePath, args);
      } else {
        await discardRestoreSafetySnapshot(args.snapshot);
      }
    }
  };
}

export type DatabaseRestoreArtifacts = ReturnType<typeof createDatabaseRestoreArtifacts>;
