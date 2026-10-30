import { vi } from 'vitest';

import { AttachmentVerificationPending, attachmentSourceVerification } from '../../../../../../lib/core/sync/attachmentSourceVerification.js';

export function deferPdfTextVerification(deferrals: number) {
  const verify = attachmentSourceVerification.verify.bind(attachmentSourceVerification);
  let deferred = 0;
  vi.spyOn(attachmentSourceVerification, 'verify').mockImplementation(async (identity, file, shouldYield, digest) => {
    if (deferred >= deferrals || file.resource.byteLength < 32 * 1024 || !file.resource.storageKey.endsWith('.pdftext')) {
      return verify(identity, file, shouldYield, digest);
    }
    deferred++;
    if (deferrals > 64) throw new AttachmentVerificationPending();
    let read = false;
    return verify(identity, { ...file, async read(offset, length) {
      const bytes = await file.read(offset, length); read = true; return bytes;
    } }, () => read, digest);
  });
  return () => deferred;
}
