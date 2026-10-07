import { adoptVerifiedBody, stageTextBodyContent } from './bodyContentWrite.js';
import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { loadRetainedVerifiedSyncNodeVersions } from './syncNodeVerifiedRetainedVersions.js';
import { orderNodeVersionHistory } from './syncNodeVersionHistory.js';
import { loadVerifiedBodyRef } from './verifiedBody.js';

/** Selection is metadata only; callers may inspect resources without publishing empty transport bodies. */
export async function loadVerifiedFramedOutboundNodes(db: DbPort, versionIds: readonly string[], globalId: string) {
  const records = await loadRetainedVerifiedSyncNodeVersions(db, versionIds);
  const selected = versionIds.map((versionId) => {
    const record = records.get(versionId);
    if (!record || record.metadata.object_id !== globalId) throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
    if (record.body.kind === 'unavailable') throw new Error(`sync_node_version_body_unavailable:${versionId}`);
    return { ...record, body: record.body } satisfies VerifiedFramedSyncNode;
  });
  const byMetadata = new Map(selected.map((node) => [node.metadata, node]));
  return orderNodeVersionHistory(selected.map((node) => node.metadata)).map((metadata) => byMetadata.get(metadata)!);
}

/** Preserve the original empty tombstone transport and every declared alternative; never replace its proof owner. */
export async function normalizeVerifiedOutboundTombstone(db: DbPort, node: VerifiedFramedSyncNode): Promise<VerifiedFramedSyncNode> {
  if (!node.metadata.is_tombstone) return node;
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
