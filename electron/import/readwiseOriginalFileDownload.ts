import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';
import { consumeReadwiseOriginalFile, type OriginalFileIdleWatchdog } from './readwiseOriginalFileRequest.js';
const MAX_ORIGINAL_FILE_BYTES = 100 * 1024 * 1024;
type OriginalFileCategory = 'epub' | 'pdf';

export async function downloadReadwiseOriginalFile(
  initialUrl: string, category: OriginalFileCategory, dependencies: ReadwiseApiFetchDependencies = {}
) {
  return consumeReadwiseOriginalFile(initialUrl, category, dependencies, async (response, idle) => {
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_ORIGINAL_FILE_BYTES) throw new Error('original_file_too_large');
    const bytes = await readBoundedBody(response.body!, idle);
    validateFileBytes(bytes, category);
    return bytes;
  });
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  idle: OriginalFileIdleWatchdog
) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    idle.signal.throwIfAborted();
    const { done, value } = await reader.read();
    if (done) break;
    idle.touch();
    size += value.byteLength;
    if (size > MAX_ORIGINAL_FILE_BYTES) {
      await reader.cancel();
      throw new Error('original_file_too_large');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function validateFileBytes(bytes: Uint8Array, category: OriginalFileCategory) {
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512)));
  const valid = category === 'pdf'
    ? prefix.subarray(0, 5).toString() === '%PDF-'
    : prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!valid) throw new Error('original_file_signature_mismatch');
}
