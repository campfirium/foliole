import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applySyncIdentityRestoreWithDbPort } from '../../lib/core/sync/syncIdentityRestoreApply.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection,
  runWithDatabaseConnectionOwner } from '../database/connection.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';
import { withDesktopForegroundTimeMaintenance } from '../database/foregroundTimeMaintenance.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

import type { DesktopIdentityPackPeer } from './desktopSyncIdentityPack.js';
import { loadDesktopSyncIdentityRestorePage } from './desktopSyncIdentityRestorePageLoad.js';
import { stageDesktopSyncIdentityRestore } from './desktopSyncIdentityRestoreStage.js';

type StagedRestore = Awaited<ReturnType<typeof stageDesktopSyncIdentityRestore>>;

async function assertStagedPackFiles(staged: StagedRestore) {
  for (const page of staged.pages) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(page.databasePath)) hash.update(chunk);
    if (`sha256:${hash.digest('hex')}` !== page.manifest.database_uncompressed_sha256) {
      throw new Error('sync_identity_restore_staged_pack_changed');
    }
  }
}

/** Apply a previously verified full source set as one SQLite transaction. */
export async function applyDesktopSyncIdentityRestore(args: {
  peer: DesktopIdentityPackPeer;
  staged: StagedRestore;
}) {
  const { peer, staged } = args;
  const set = staged.set;
  if (set.group_id !== peer.group_id || set.source_peer_id !== peer.peer_device_id ||
      set.target_peer_id !== peer.local_device_id) {
    throw new Error('sync_identity_restore_source_mismatch');
  }
  await assertStagedPackFiles(staged);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-restore-apply-'));
  const replayPath = path.join(root, 'replay.db');
  try {
    if (staged.pages.length > 0) await fs.copyFile(staged.pages[0]!.databasePath, replayPath);
    return await runWithDatabaseConnectionOwner(() => withDesktopForegroundTimeMaintenance(async () => {
      const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite,
        { name: 'desktop-identity-restore-apply' });
      if (staged.pages.length > 0) {
        await port.run(`ATTACH DATABASE '${replayPath.replaceAll("'", "''")}' AS inc`);
      }
      try {
        return await applySyncIdentityRestoreWithDbPort(port, {
          set, pages: staged.pages.map((page) => page.manifest),
          hostName: loadOrCreateDesktopHostName(),
          loadPage: (tx, index) => loadDesktopSyncIdentityRestorePage(tx,
            staged.pages[index]!.databasePath),
          onSettingApplied: materializeDesktopSettingRecord,
          ...(peer.peer_device_name ? { sourceHostName: peer.peer_device_name } : {})
        });
      } finally {
        if (staged.pages.length > 0) await port.run('DETACH DATABASE inc');
      }
    }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
