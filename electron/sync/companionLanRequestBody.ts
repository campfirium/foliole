import type http from 'node:http';

const MAX_REQUEST_BYTES = 1024 * 1024;

export async function readCompanionRequestBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new Error('request_too_large');
    }
    chunks.push(bufferChunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
