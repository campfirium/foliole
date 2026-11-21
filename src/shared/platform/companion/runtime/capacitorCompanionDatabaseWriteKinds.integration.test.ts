// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { confirmFolderDatabaseBackup, isFolderDatabaseBackupCurrent, readFolderBackupRevision } from '../folderBackup/companionFolderBackupProgress';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CompanionWriteKind } from './capacitorCompanionDatabaseOwner';

const platforms = ['android', 'ios'] as const;
const silentKinds = ['usage', 'device-local', 'backup', 'derived'] as const satisfies readonly CompanionWriteKind[];
const probe = "INSERT OR REPLACE INTO companion_meta(key,value,updated_at) VALUES ('write-kind-probe','changed','now')";

async function openWithCurrentBackup(platform: typeof platforms[number]) {
  const library = createDisplayLibrary(platform);
  await library.owner.open({ expectedHostName: 'fixture', now: '2026-11-21T00:00:00Z' });
  await library.owner.runWriter(async db => confirmFolderDatabaseBackup(db, 'profile', await readFolderBackupRevision(db)),
    { kind: 'backup' });
  const woken = vi.fn();
  library.owner.committedWrites.subscribe(woken);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const reading = new Promise<void>(resolve => { started = resolve; });
  const scan = library.owner.readBackgroundSnapshot(async db => {
    started(); await gate;
    return db.query('SELECT count(*) AS count FROM nodes');
  }).then(() => 'finished', (error: unknown) => String(error));
  await reading;
  const current = () => library.owner.read(db => isFolderDatabaseBackupCurrent(db, 'profile'));
  return { library, woken, release, scan, current };
}

it.each(platforms.flatMap(platform => silentKinds.map(kind => [platform, kind] as const)))(
  '%s %s writes commit without staling the backup, waking it or aborting a background scan', async (platform, kind) => {
    const f = await openWithCurrentBackup(platform);
    try {
      await f.library.owner.runWriter(db => db.run(probe), { kind });
      f.release();
      expect(await f.scan).toBe('finished');
      expect(await f.library.owner.read(db => db.query("SELECT value FROM companion_meta WHERE key='write-kind-probe'")))
        .toEqual([{ value: 'changed' }]);
      expect(await f.current()).toBe(true);
      expect(f.woken).not.toHaveBeenCalled();
    } finally { f.release(); await f.library.close(); }
  });

it.each(platforms)('%s business writes stale the backup, wake it and abort a background scan', async platform => {
  const f = await openWithCurrentBackup(platform);
  try {
    await f.library.owner.runWriter(db => db.run(probe), { kind: 'business' });
    f.release();
    expect(await f.scan).toContain('attachment_scan_foreground_write');
    expect(await f.current()).toBe(false);
    expect(f.woken).toHaveBeenCalledTimes(1);
  } finally { f.release(); await f.library.close(); }
});
