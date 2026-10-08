import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import type { DbPort } from './dbPort.js';
import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { projectFramedSyncResourceFact } from './framedSyncResourceFact.js';
import type { FramedSyncRequestedResource } from './framedSyncResourceRequest.js';
import { assertSyncGroupLocalPublicationAllowed } from './syncGroupLocalAdoption.js';

/** Hosts verify their files; the shared owner freezes the requested identities and publication. */
export async function publishFramedSyncResourceOutbound(input: Readonly<{
  context: FramedSyncContext;
  db: DbPort;
  sources: readonly Readonly<{ demand: FramedSyncRequestedResource; byteLength: bigint }>[];
}>) {
  const first = input.sources[0];
  if (!first || input.sources.some(({ demand }) => demand.globalId !== first.demand.globalId)) {
    throw new Error('framed_sync_resource_unit_invalid');
  }
  const facts = input.sources.map(({ demand, byteLength }) => {
    const parsed = parseCanonicalAttachmentStorageKey(demand.storageKey);
    if (!parsed) throw new Error('framed_sync_resource_request_invalid');
    const role = parsed.mimeType.startsWith('image/') ? 2 : parsed.mimeType === 'application/pdf' ? 3 : 4;
    return projectFramedSyncResourceFact(demand,
      { contentHash: parsed.contentHash, storageKey: parsed.storageKey, role }, byteLength);
  });
  const manifest = { facts, blobs: facts.flatMap((fact) => fact.blobs) };
  const contentId = await canonicalContentId(manifest);
  const publication = { context: input.context, contentId, manifestHash: contentId, manifest,
    transferId: await canonicalTransferId(input.context, contentId) };
  const state = await input.db.transaction(async (tx) => {
    await assertSyncGroupLocalPublicationAllowed(tx);
    return publishFramedSyncOutboundWithDbPort(tx, publication);
  });
  return { publication, state };
}
