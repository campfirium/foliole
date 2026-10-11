import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import { FRAMED_SYNC_CONTENT_TYPE } from '../../lib/core/sync/framedSyncHttpContract.js';
import type { NativeRequestSyncHttpRequest } from '../../lib/platform/nativeRequestSyncHttpContract.js';

/** Substitute the OS file/HTTP boundary while retaining the production JS request path. */
export async function postCompanionRequestFixture(files: FramedSyncFilePort, input: NativeRequestSyncHttpRequest) {
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < input.request_chunk_count; index++) {
    const chunk = await files.read(`${input.directory}/http-out-${index}`);
    if (!chunk) throw new Error('fixture_request_chunk_missing');
    chunks.push(chunk);
  }
  const response = await fetch(input.url, { method: 'POST', body: Buffer.concat(chunks),
    headers: { ...input.headers, 'Content-Type': FRAMED_SYNC_CONTENT_TYPE } });
  if (!response.ok) throw new Error(`request_sync_http_${response.status}:${await response.text()}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const size = 512 * 1024;
  for (let offset = 0; offset < bytes.length; offset += size) {
    await files.write(`${input.directory}/http-in-${offset / size}`, bytes.subarray(offset, offset + size));
  }
  return { response_chunk_count: Math.ceil(bytes.length / size), response_byte_length: bytes.length };
}
