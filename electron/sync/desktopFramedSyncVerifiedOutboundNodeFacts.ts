import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectVerifiedFramedSyncNode } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { loadVerifiedFramedOutboundNodes, normalizeVerifiedOutboundTombstone } from '../../lib/core/sync/framedSyncVerifiedOutboundNodeFacts.js';

import { resolveDesktopFramedSyncNodeResources } from './desktopFramedSyncNodeResources.js';

/** Caller owns publication transaction. A missing matching tombstone version retains the original empty transport. */
export async function selectDesktopFramedSyncVerifiedOutboundNodeFacts(
  db: DbPort, versionIds: readonly string[], globalId: string
): Promise<readonly Readonly<{ manifest: CanonicalManifest }>[]> {
  const selected = await loadVerifiedFramedOutboundNodes(db, versionIds, globalId);
  const projections = [];
  for (const source of selected) {
    const node = await normalizeVerifiedOutboundTombstone(db, source);
    const resources = node.body.kind === 'retired' ? [] : resolveDesktopFramedSyncNodeResources(node.metadata);
    const fact = projectVerifiedFramedSyncNode(node, resources.map((resource) => resource.blob));
    projections.push({ manifest: { facts: [fact], blobs: fact.blobs } });
  }
  return projections;
}
