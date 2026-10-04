import type { SyncIdentityPage } from '../../../../../lib/core/sync/syncIdentityDiff.js';
import { diffSyncIdentityGlobalPages, type SyncIdentityInventory } from '../../../../../lib/core/sync/syncIdentityPagedDiff.js';
import { canReuseSyncIdentityFactProof } from '../../../../../lib/core/sync/syncIdentityPeerBaseline.js';

import { stageCompanionIdentityCandidates,
  type CompanionIdentityCandidateRow } from './syncGroupIdentityCandidateStore';
import { readCompanionLocalIdentitySource } from './syncGroupIdentityLocalRead';
import { readCompanionRemoteFactPage, readCompanionRemoteFactSummary,
  type CompanionIdentityFactEntry } from './syncGroupIdentityRemoteRead';

interface LocalFactSummary { inventory: SyncIdentityInventory; proof_root: string }
interface LocalFactPage extends SyncIdentityPage { entries: CompanionIdentityFactEntry[] }

export async function stageCompanionIdentityFactCandidates(args: {
  endpointUrl: string; remoteViewId: string; snapshotPath: string;
  factBaseline?: { localProofRoot: string; peerProofRoot: string;
    proofRevision: string } | null;
}) {
  const remote = await readCompanionRemoteFactSummary(args.endpointUrl, args.remoteViewId);
  const local = await readCompanionLocalIdentitySource<LocalFactSummary>(
    args.snapshotPath, 'fact_global_summary');
  if (!/^[a-f0-9]{64}$/u.test(local.proof_root)) {
    throw new Error('sync_identity_local_fact_proof_invalid');
  }
  const roots = { localProofRoot: local.proof_root, peerProofRoot: remote.proof_root };
  if (canReuseSyncIdentityFactProof(args.factBaseline, roots)) return roots;
  const pending: CompanionIdentityCandidateRow[] = [];
  const flush = async () => {
    if (pending.length === 0) return;
    await stageCompanionIdentityCandidates(args.snapshotPath, pending.splice(0));
  };
  for await (const candidate of diffSyncIdentityGlobalPages(remote.inventory, local.inventory,
    (after) => readCompanionRemoteFactPage(args.endpointUrl,
      args.remoteViewId, after),
    (after) => readCompanionLocalIdentitySource<LocalFactPage>(args.snapshotPath,
      'fact_global_page', { after_type: after?.object_type, after_id: after?.object_id }),
    (left, right) => left.repair_required === true || right.repair_required === true)) {
    const source = 'source' in candidate ? candidate.source as CompanionIdentityFactEntry : null;
    const receiver = 'receiver' in candidate ? candidate.receiver as CompanionIdentityFactEntry : null;
    pending.push({ object_type: 'node', object_id: (source ?? receiver)!.object_id,
      partition: -1, kind: candidate.kind,
      source_fingerprint: source?.state_fingerprint ?? null,
      receiver_fingerprint: receiver?.state_fingerprint ?? null });
    if (pending.length === 128) await flush();
  }
  await flush();
  return roots;
}
