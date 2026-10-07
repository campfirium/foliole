import { adoptVerifiedBody, stageTextBodyContent } from '../../lib/core/sync/bodyContentWrite.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectVerifiedFramedSyncNode } from '../../lib/core/sync/framedSyncNodeProjection.js';
import type { VerifiedFramedSyncNode } from '../../lib/core/sync/framedSyncVerifiedNode.js';
import { loadRetainedVerifiedSyncNodeVersions } from '../../lib/core/sync/syncNodeVerifiedRetainedVersions.js';
import { orderNodeVersionHistory } from '../../lib/core/sync/syncNodeVersionHistory.js';
import { loadVerifiedBodyRef } from '../../lib/core/sync/verifiedBody.js';

import { resolveDesktopFramedSyncNodeResources } from './desktopFramedSyncNodeResources.js';

async function tombstoneTransport(db: DbPort, node: VerifiedFramedSyncNode): Promise<VerifiedFramedSyncNode> {
  const ref = node.body.kind === 'readable' ? node.body.ref : await stageTextBodyContent(db, '');
  if (node.body.kind === 'retired') await adoptVerifiedBody(db, ref, node.metadata.updated_at);
  const alternatives = [];
  for (const entry of node.metadata.snapshot.text_alternatives ?? []) {
    const alternative = await loadVerifiedBodyRef(db, entry.body_blob_hash);
    if (!alternative) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    alternatives.push(alternative);
  }
  return { ...node, body: { kind: 'readable', ref }, alternativeBodies: alternatives,
    metadata: { ...node.metadata, snapshot: { ...node.metadata.snapshot, body_blob_hash: ref.hash } } };
}

/** Caller owns publication transaction. A missing matching tombstone version retains the original empty transport. */
export async function selectDesktopFramedSyncVerifiedOutboundNodeFacts(
  db: DbPort, versionIds: readonly string[], globalId: string
): Promise<readonly Readonly<{ manifest: CanonicalManifest }>[]> {
  const records = await loadRetainedVerifiedSyncNodeVersions(db, versionIds);
  const selected = versionIds.map((versionId) => {
    const record = records.get(versionId);
    if (!record || record.metadata.object_id !== globalId) throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
    if (record.body.kind === 'unavailable') throw new Error(`sync_node_version_body_unavailable:${versionId}`);
    return { ...record, body: record.body } satisfies VerifiedFramedSyncNode;
  });
  const byMetadata = new Map(selected.map((node) => [node.metadata, node]));
  const projections = [];
  for (const metadata of orderNodeVersionHistory(selected.map((node) => node.metadata))) {
    const source = byMetadata.get(metadata)!;
    const node = metadata.is_tombstone ? await tombstoneTransport(db, source) : source;
    const resources = node.body.kind === 'retired' ? [] : resolveDesktopFramedSyncNodeResources(node.metadata);
    const fact = projectVerifiedFramedSyncNode(node, resources.map((resource) => resource.blob));
    projections.push({ manifest: { facts: [fact], blobs: fact.blobs } });
  }
  return projections;
}
