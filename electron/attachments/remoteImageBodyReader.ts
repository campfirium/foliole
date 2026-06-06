export const REMOTE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

export type RemoteImageBodyReadResult =
  | { status: 'ready'; bytes: Uint8Array }
  | { status: 'too_large'; bytes: number };

function parseContentLength(response: Response) {
  const headerValue = response.headers.get('content-length');
  if (!headerValue?.trim()) return null;
  const parsed = Number(headerValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function createAbortError() {
  return new Error('Remote image body read was aborted.');
}

async function runWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw createAbortError();
  let removeAbortListener: () => void = () => undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  try {
    return await Promise.race([operation, abortPromise]);
  } finally {
    removeAbortListener();
  }
}

function appendChunk(target: Uint8Array, chunk: Uint8Array, offset: number) {
  target.set(chunk, offset);
  return offset + chunk.byteLength;
}

function combineChunks(chunks: Uint8Array[], totalBytes: number) {
  const bytes = new Uint8Array(totalBytes);
  chunks.reduce((offset, chunk) => appendChunk(bytes, chunk, offset), 0);
  return bytes;
}

async function readStreamBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): Promise<RemoteImageBodyReadResult> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const result = await runWithAbort(reader.read(), signal);
      if (result.done) break;
      const chunk = result.value;
      totalBytes += chunk.byteLength;
      if (totalBytes > REMOTE_IMAGE_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: 'too_large', bytes: totalBytes };
      }
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The pending read may still be settling after an abort; cancellation above owns cleanup.
    }
  }
  return { status: 'ready', bytes: combineChunks(chunks, totalBytes) };
}

export async function readRemoteImageResponseBytes(
  response: Response,
  signal: AbortSignal
): Promise<RemoteImageBodyReadResult> {
  const contentLength = parseContentLength(response);
  if (contentLength !== null && contentLength > REMOTE_IMAGE_MAX_BYTES) {
    return { status: 'too_large', bytes: contentLength };
  }
  if (response.body) {
    return readStreamBody(response.body, signal);
  }
  const bytes = new Uint8Array(await runWithAbort(response.arrayBuffer(), signal));
  return bytes.length > REMOTE_IMAGE_MAX_BYTES
    ? { status: 'too_large', bytes: bytes.length }
    : { status: 'ready', bytes };
}
