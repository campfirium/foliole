import { createSyncIdentityDigest } from '../../../../../lib/core/sync/syncIdentityDigest.js';
import { diffSyncIdentityGlobalPages } from '../../../../../lib/core/sync/syncIdentityPagedDiff.js';
import { parseSyncIdentityRestoreSet } from '../../../../../lib/core/sync/syncIdentityRestoreSet.js';
import { fetchDesktopJson } from '../../companionDesktopSyncHttp';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import { countCompanionIdentityCandidates,
  initializeCompanionIdentityCandidates, stageCompanionIdentityCandidates,
  type CompanionIdentityCandidateRow } from './syncGroupIdentityCandidateStore';
import { readCompanionRemoteIdentityGlobalPage } from './syncGroupIdentityRemoteRead';

/** Stage the entire fixed source set without comparing or mutating receiver facts. */
export async function probeCompanionSyncIdentityRestoreSet(args: {
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  peerDeviceId: string;
  restoreId: string;
}) {
  const set = parseSyncIdentityRestoreSet(await fetchDesktopJson<unknown>(args.endpointUrl,
    '/companion/sync-identity-restore-set?' +
      new URLSearchParams({ restore_id: args.restoreId })));
  if (set.restore_id !== args.restoreId || set.group_id !== args.groupId ||
      set.source_peer_id !== args.peerDeviceId ||
      set.target_peer_id !== args.localDeviceId) {
    throw new Error('sync_identity_restore_source_mismatch');
  }
  const local = await FolioleCompanionSync.createIdentitySourceView();
  const snapshotPath = local.snapshot_path;
  try {
    await initializeCompanionIdentityCandidates(snapshotPath);
    const pending: CompanionIdentityCandidateRow[] = [];
    const flush = async () => {
      if (pending.length) await stageCompanionIdentityCandidates(snapshotPath, pending.splice(0));
    };
    for await (const candidate of diffSyncIdentityGlobalPages(set.inventory,
      { row_count: 0, digest: createSyncIdentityDigest().finish() },
      (after) => readCompanionRemoteIdentityGlobalPage(args.endpointUrl,
        set.source_view_id, after, args.restoreId),
      async () => ({ entries: [], nextAfter: null }))) {
      if (candidate.kind !== 'source_only') throw new Error('sync_identity_restore_set_invalid');
      pending.push({ object_type: candidate.source.object_type,
        object_id: candidate.source.object_id, partition: -1,
        kind: 'source_only', source_fingerprint: candidate.source.fingerprint,
        receiver_fingerprint: null });
      if (pending.length === 128) await flush();
    }
    await flush();
    const count = await countCompanionIdentityCandidates(snapshotPath);
    if (count !== set.object_count) throw new Error('sync_identity_restore_set_invalid');
    return { count, set, snapshotPath,
      cleanup: () => FolioleCompanionSync.closeIdentitySourceView({ snapshot_path: snapshotPath }) };
  } catch (error) {
    await FolioleCompanionSync.closeIdentitySourceView({ snapshot_path: snapshotPath });
    throw error;
  }
}
