import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { createPreparedDesktopTextImport } from '../../../../lib/core/import/fingerprint';
import { buildPdfReaderPlaceholder } from '../../../../lib/core/import/pdfReaderPlaceholder';

export function prepareSelectedPdfImport(bytes: Uint8Array, name: string) {
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
    throw new Error('The selected file is not a PDF document.');
  }
  const storageKey = `${bytesToHex(sha256(bytes))}.pdf`;
  const prepared = createPreparedDesktopTextImport({
    content: buildPdfReaderPlaceholder(name), kind: 'pdf', fileName: name, filePath: name,
    sourceIdentity: crypto.randomUUID(), sourceTrackingMode: 'untracked', importedAt: new Date().toISOString()
  });
  return { ...prepared, pdfSource: { bytes, storageKey } };
}
