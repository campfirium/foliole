import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createSyncIdentityDigest } from '../../lib/core/sync/syncIdentityDigest.js';
import { diffSyncIdentityGlobalPages, type SyncIdentityGlobalPage } from '../../lib/core/sync/syncIdentityPagedDiff.js';
import { parseSyncIdentityRestoreSet } from '../../lib/core/sync/syncIdentityRestoreSet.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { openCandidateDb } from './desktopSyncIdentityProbe.js';

interface ProbeArgs {
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  outputRoot: string;
  peerDeviceId: string;
  restoreId: string;
  secret: string;
}

interface RemotePage extends SyncIdentityGlobalPage {
  contract: string;
  source_view_id: string;
}

async function readRestorePage(args: ProbeArgs, viewId: string,
  after: SyncIdentityGlobalPage['nextAfter']) {
  const query = new URLSearchParams({ restore_id: args.restoreId,
    source_view_id: viewId });
  if (after) {
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  const page = await fetchDesktopWorkgroupJson<RemotePage>({
    ...args, pathWithQuery: `/companion/sync-identity-global-page?${query}`
  });
  if (page.contract !== 'global-id-v2' || page.source_view_id !== viewId) throw new Error('sync_identity_restore_view_changed');
  return page;
}

/** Enumerate the entire authenticated source view without consulting receiver facts. */
export async function probeDesktopSyncIdentityRestoreSet(args: ProbeArgs) {
  await fs.mkdir(args.outputRoot, { recursive: true });
  const staging = await fs.mkdtemp(path.join(args.outputRoot, '.identity-restore-'));
  let db: Database.Database | undefined;
  try {
    const set = parseSyncIdentityRestoreSet(await fetchDesktopWorkgroupJson<unknown>({
      ...args, pathWithQuery: '/companion/sync-identity-restore-set?' +
        new URLSearchParams({ restore_id: args.restoreId })
    }));
    if (set.restore_id !== args.restoreId || set.group_id !== args.groupId ||
        set.source_peer_id !== args.peerDeviceId ||
        set.target_peer_id !== args.localDeviceId) {
      throw new Error('sync_identity_restore_source_mismatch');
    }
    const candidatePath = path.join(staging, 'candidates.db');
    db = openCandidateDb(candidatePath);
    const insert = db.prepare(`INSERT INTO candidates
      (object_type, object_id, partition, kind, source_fingerprint, receiver_fingerprint)
      VALUES (?, ?, ?, 'source_only', ?, NULL)`);
    let count = 0;
    for await (const candidate of diffSyncIdentityGlobalPages(set.inventory,
      { row_count: 0, digest: createSyncIdentityDigest().finish() },
      (after) => readRestorePage(args, set.source_view_id, after),
      async () => ({ entries: [], nextAfter: null }))) {
      if (candidate.kind !== 'source_only') throw new Error('sync_identity_restore_set_invalid');
      insert.run(candidate.source.object_type, candidate.source.object_id,
        -1, candidate.source.fingerprint);
      count += 1;
    }
    if (count !== set.object_count) throw new Error('sync_identity_restore_set_invalid');
    db.exec('COMMIT');
    db.close();
    db = undefined;
    return { candidatePath, count, set,
      cleanup: () => fs.rm(staging, { recursive: true, force: true }) };
  } catch (error) {
    if (db?.inTransaction) db.exec('ROLLBACK');
    db?.close();
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
