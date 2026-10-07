import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { stageTextBodyContent } from './bodyContentWrite.js';
import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { loadVerifiedBodyRef, type VerifiedBodyRef } from './verifiedBody.js';

/** Caller owns the transaction through version adoption; this helper only stages content. */
export async function adoptEditorSyncNodeRecord(db: DbPort, record: NativeSyncNodeRecord): Promise<VerifiedFramedSyncNode> {
  if (typeof record.body_text !== 'string') throw new Error('content_edit_body_unavailable');
  const ref = await stageTextBodyContent(db, record.body_text);
  const metadata = { ...record };
  delete metadata.body_text;
  delete metadata.alternative_bodies;
  const snapshot = { ...record.snapshot };
  snapshot.content = null;
  snapshot.body_blob_hash = ref.hash;
  const alternativeBodies: VerifiedBodyRef[] = [];
  for (const entry of snapshot.text_alternatives ?? []) {
    const alternative = await loadVerifiedBodyRef(db, entry.body_blob_hash);
    if (!alternative) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    alternativeBodies.push(alternative);
  }
  return { metadata: { ...metadata, snapshot }, body: { kind: 'readable', ref }, alternativeBodies };
}
