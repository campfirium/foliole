import { PDF_TEXT_EXTRACTOR_VERSION } from './pdfTextArtifact.js';
import type { AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';

export async function exchangePdfTextArtifacts(input: {
  signal?: AbortSignal; host: RequestSyncAttachmentHost; keys: string[]; shouldYield: () => boolean;
  describe: (key: string) => Promise<AttachmentRequest>;
  pull: (key: string) => Promise<{ complete: boolean; blocks: number }>;
  report: (key: string, error: unknown) => void;
}) {
  let blocks = 0; let transferred = 0; let pending = 0;
  if (!input.host.importPdfText) return { blocks, transferred, pending };
  for (const key of input.keys) {
    input.signal?.throwIfAborted();
    if (input.shouldYield()) { pending++; continue; }
    try {
      const description = await input.describe(key);
      if (description.state === 'end') { pending++; continue; }
      const [artifact] = description.storageKeys;
      if (description.state !== 'complete' || description.storageKeys.length !== 1 || !artifact?.endsWith('.pdftext') ||
          description.extractorVersion !== PDF_TEXT_EXTRACTOR_VERSION) throw new Error('pdf_text_description_invalid');
      const result = await input.pull(artifact);
      blocks += result.blocks;
      if (!result.complete) { pending++; continue; }
      await input.host.importPdfText(key, artifact);
      transferred++;
    } catch (error) { input.signal?.throwIfAborted(); pending++; input.report(key, error); }
  }
  return { blocks, transferred, pending };
}
