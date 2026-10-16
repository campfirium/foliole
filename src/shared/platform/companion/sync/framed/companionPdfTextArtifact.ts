import { ATTACHMENT_BLOCK_BYTES } from '../../../../../../lib/core/sync/attachmentBlockReceiver.js';
import type { AttachmentBlockSource } from '../../../../../../lib/core/sync/attachmentBlockTransfer.js';
import { importPdfTextArtifact } from '../../../../../../lib/core/sync/pdfTextArtifact.js';
import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import { notifyAttachmentResourceAvailable } from '../../../runtime/attachmentResourceAvailability.js';
import { publishCompanionSyncApplied } from '../companionSyncApplied.js';

export async function importCompanionPdfTextArtifact(db: RequestSyncDatabaseHost, files: AttachmentBlockSource,
  pdfKey: string, artifactKey: string) {
  const text = await files.withFile(artifactKey, async file => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const parts: string[] = [];
    for (let offset = 0; offset < file.resource.byteLength; offset += ATTACHMENT_BLOCK_BYTES) {
      parts.push(decoder.decode(await file.read(offset, Math.min(ATTACHMENT_BLOCK_BYTES, file.resource.byteLength - offset)), { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  });
  await db.write(port => importPdfTextArtifact(port, pdfKey, artifactKey, text));
  notifyAttachmentResourceAvailable(pdfKey);
  publishCompanionSyncApplied();
}
