import { diffSyncIdentityGlobalPages, type SyncIdentityGlobalPage,
  type SyncIdentityInventory } from '../../../../../lib/core/sync/syncIdentityPagedDiff.js';
import { FolioleCompanionLegacyIdentitySource } from '../../companionWorkspaceRuntimeRepository';

import { countCompanionIdentityCandidates, initializeCompanionIdentityCandidates,
  stageCompanionIdentityCandidates, type CompanionIdentityCandidateRow
} from './syncGroupIdentityCandidateStore';
import { readCompanionLocalIdentitySource } from './syncGroupIdentityLocalRead';
import { stageCompanionIdentityFactCandidates } from './syncGroupIdentityProbeFacts';
import { readCompanionRemoteIdentityGlobalPage,
  readCompanionRemoteIdentityGlobalSummary,
  type CompanionIdentityGlobalSummary } from './syncGroupIdentityRemoteRead';
import { excludeCompanionSyncIdentitySatisfiedFacts } from './syncGroupIdentitySemanticProof';

interface LocalSummary {
  inventory: SyncIdentityInventory;
  source_epoch: string;
  watermark: string;
}

async function stageFullCandidates(endpointUrl: string, snapshotPath: string,
  remote: CompanionIdentityGlobalSummary, summary: LocalSummary) {
  const pending: CompanionIdentityCandidateRow[] = [];
  const flush = async () => {
    if (pending.length) await stageCompanionIdentityCandidates(snapshotPath, pending.splice(0));
  };
  for await (const candidate of diffSyncIdentityGlobalPages(remote.inventory, summary.inventory,
    (after) => readCompanionRemoteIdentityGlobalPage(endpointUrl,
      remote.source_view_id, after),
    (after) => readCompanionLocalIdentitySource<SyncIdentityGlobalPage>(snapshotPath,
      'global_page', { after_type: after?.object_type, after_id: after?.object_id }))) {
    const identity = 'source' in candidate ? candidate.source : candidate.receiver;
    pending.push({ object_type: identity.object_type, object_id: identity.object_id,
      partition: -1, kind: candidate.kind,
      source_fingerprint: 'source' in candidate ? candidate.source.fingerprint : null,
      receiver_fingerprint: 'receiver' in candidate ? candidate.receiver.fingerprint : null });
    if (pending.length === 128) await flush();
  }
  await flush();
}

export async function probeCompanionSyncIdentities(endpointUrl: string) {
  const local = await FolioleCompanionLegacyIdentitySource.createIdentitySourceView();
  const snapshotPath = local.snapshot_path;
  try {
    const remote = await readCompanionRemoteIdentityGlobalSummary(endpointUrl);
    const summary = await readCompanionLocalIdentitySource<LocalSummary>(snapshotPath, 'global_summary');
    await initializeCompanionIdentityCandidates(snapshotPath);
    const usedTimeCandidates = false;
    await stageFullCandidates(endpointUrl, snapshotPath, remote, summary);
    const roots = await stageCompanionIdentityFactCandidates({ endpointUrl,
      remoteViewId: remote.source_view_id, snapshotPath,
      factBaseline: null });
    await excludeCompanionSyncIdentitySatisfiedFacts({ endpointUrl,
      remoteViewId: remote.source_view_id, snapshotPath });
    return { count: await countCompanionIdentityCandidates(snapshotPath), usedTimeCandidates,
      ...roots,
      localViewId: local.source_view_id, snapshotPath,
      localEpoch: summary.source_epoch, localWatermark: summary.watermark,
      sourceViewId: remote.source_view_id, sourceEpoch: remote.source_epoch,
      sourceWatermark: remote.watermark,
      cleanup: () => FolioleCompanionLegacyIdentitySource.closeIdentitySourceView({ snapshot_path: snapshotPath }) };
  } catch (error) {
    await FolioleCompanionLegacyIdentitySource.closeIdentitySourceView({ snapshot_path: snapshotPath });
    throw error;
  }
}
