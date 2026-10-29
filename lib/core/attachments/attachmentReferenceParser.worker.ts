import type { AttachmentReferenceInput } from './attachmentReferenceInputs.js';
import { parseAttachmentReferenceInput } from './attachmentReferenceInputs.js';

self.onmessage = ({ data }: MessageEvent<AttachmentReferenceInput[]>) => {
  try { self.postMessage({ results: data.map(parseAttachmentReferenceInput) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
