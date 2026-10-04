import type { SyncIdentityChangedCursor,
  SyncIdentityChangedRemotePage } from '../../../../../lib/core/sync/syncIdentityChangedPage.js';
import { diffSyncIdentitySummaries,
  type SyncIdentityPage, type SyncIdentitySummaryRow } from '../../../../../lib/core/sync/syncIdentityDiff.js';
import { syncIdentityPartition } from '../../../../../lib/core/sync/syncIdentityDigest.js';

import { initializeCompanionIdentityChangedKeys,
  readCompanionIdentityChangedPartitions, stageCompanionIdentityChangedCandidates,
  stageCompanionIdentityChangedKeys, type CompanionIdentityCandidateRow
} from './syncGroupIdentityCandidateStore';
import { readCompanionLocalIdentitySource } from './syncGroupIdentityLocalRead';
import { readCompanionRemoteChangedPage,
  readCompanionRemoteIdentityPage } from './syncGroupIdentityRemoteRead';

interface ChangedArgs {
  endpointUrl: string;
  localSummary: SyncIdentitySummaryRow[];
  localWatermark: string;
  peerSummary: SyncIdentitySummaryRow[];
  peerViewId: string;
  peerWatermark: string;
  snapshotPath: string;
}

async function collectChangedKeys(args: ChangedArgs) {
  await initializeCompanionIdentityChangedKeys(args.snapshotPath);
  const pending: Array<{ object_type: string; object_id: string; partition: number }> = [];
  const flush = async () => {
    if (pending.length) await stageCompanionIdentityChangedKeys(args.snapshotPath, pending.splice(0));
  };
  for (const side of ['peer', 'local'] as const) {
    let after: SyncIdentityChangedCursor | null = null;
    for (;;) {
      const page: Pick<SyncIdentityChangedRemotePage, 'entries' | 'nextAfter'> = side === 'peer'
        ? await readCompanionRemoteChangedPage(args.endpointUrl, args.peerViewId,
          args.peerWatermark, after)
        : await readCompanionLocalIdentitySource<Pick<SyncIdentityChangedRemotePage,
          'entries' | 'nextAfter'>>(args.snapshotPath, 'changed_page', {
          since: args.localWatermark, after_updated_at: after?.updated_at,
          after_type: after?.object_type, after_id: after?.object_id });
      for (const entry of page.entries) {
        const partition = syncIdentityPartition(entry.object_type, entry.object_id);
        if (args.peerSummary[partition]?.digest !== args.localSummary[partition]?.digest) {
          pending.push({ object_type: entry.object_type, object_id: entry.object_id, partition });
          if (pending.length === 128) await flush();
        }
      }
      if (!page.nextAfter) break;
      after = page.nextAfter;
    }
  }
  await flush();
}

/** A time index narrows work; a complete probe must still follow the exchange. */
export async function stageCompanionIdentityChangedProbe(args: ChangedArgs) {
  await collectChangedKeys(args);
  const selected = new Set((await readCompanionIdentityChangedPartitions(args.snapshotPath))
    .map((row) => row.partition));
  const masked = args.peerSummary.map((row, index) =>
    selected.has(index) ? row : args.localSummary[index]!);
  const pending: CompanionIdentityCandidateRow[] = [];
  const flush = async () => {
    if (pending.length) await stageCompanionIdentityChangedCandidates(args.snapshotPath,
      pending.splice(0));
  };
  for await (const candidate of diffSyncIdentitySummaries(masked, args.localSummary,
    (partition, after) => readCompanionRemoteIdentityPage(args.endpointUrl,
      args.peerViewId, partition, after),
    (partition, after) => readCompanionLocalIdentitySource<SyncIdentityPage>(args.snapshotPath,
      'page', { partition, after_type: after?.object_type, after_id: after?.object_id }))) {
    const identity = 'source' in candidate ? candidate.source : candidate.receiver;
    pending.push({ object_type: identity.object_type, object_id: identity.object_id,
      partition: candidate.partition, kind: candidate.kind,
      source_fingerprint: 'source' in candidate ? candidate.source.fingerprint : null,
      receiver_fingerprint: 'receiver' in candidate ? candidate.receiver.fingerprint : null });
    if (pending.length === 128) await flush();
  }
  await flush();
}
