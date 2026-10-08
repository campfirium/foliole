import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncFactFrame } from '../../lib/core/sync/framedSyncFactFrameReader.js';
import { restoreFramedSyncNodeReadingFact } from '../../lib/core/sync/framedSyncNodeReadingFact.js';
import type { FramedSyncNodeResource } from '../../lib/core/sync/framedSyncNodeResources.js';
import { restoreFramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { restoreFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { streamFramedSyncReadyFactFrames } from '../../lib/core/sync/framedSyncReadyFactFrames.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND, restoreFramedSyncResourceFact } from '../../lib/core/sync/framedSyncResourceFact.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

type ResourceNode = Readonly<{ snapshot: Pick<NativeSyncNodeRecord['snapshot'], 'resource_references'> }>;

/** Preserve business-unit, all state, then node validation without retaining fact payloads. */
export async function readVerifiedReceiverResourceNodes(db: DbPort, transferId: Uint8Array, attemptId: Uint8Array) {
  let identity: { globalId: string; objectType: string } | undefined;
  let resourceUnit: boolean | undefined;
  const resources: FramedSyncNodeResource[] = [];
  for await (const { fact } of streamFramedSyncReadyFactFrames(db, transferId, attemptId, 'desktop')) {
    identity ??= { globalId: fact.globalId, objectType: fact.objectType };
    resourceUnit ??= fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND;
    if (fact.globalId !== identity.globalId || fact.objectType !== identity.objectType ||
        (fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) !== resourceUnit ||
        ![1, 2, 3, 4, FRAMED_SYNC_RESOURCE_FACT_KIND].includes(fact.kind)) {
      throw new Error('framed_sync_process_fact_set_invalid');
    }
    if (resourceUnit) resources.push(restoreFramedSyncResourceFact(fact).resource);
  }
  if (!identity) throw new Error('framed_sync_process_fact_set_invalid');
  const nodeSequences: string[] = [];
  for await (const { sequence, fact } of streamFramedSyncReadyFactFrames(db, transferId, attemptId, 'desktop')) {
    if (fact.kind === 1) {
      if (fact.objectType === 'node') restoreFramedSyncNodeReadingFact(fact);
      else restoreFramedSyncObjectStateFact(fact);
    } else if (fact.kind === 2) nodeSequences.push(sequence);
  }
  const nodes: ResourceNode[] = [];
  for (const sequence of nodeSequences) {
    const decoded = await readFramedSyncFactFrame(db, transferId, attemptId, sequence, 'desktop');
    const fact = canonicalFactFromValidatedMessage(decoded.message);
    const node = restoreFramedSyncNodeMetadata(fact);
    nodes.push({ snapshot: node.snapshot.resource_references === undefined ? {} :
      { resource_references: node.snapshot.resource_references } });
  }
  if (new Set(resources.map((entry) => entry.contentHash)).size !== resources.length) {
    throw new Error('framed_sync_resource_unit_invalid');
  }
  return { nodes, resources };
}
