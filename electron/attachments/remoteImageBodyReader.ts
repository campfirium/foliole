export const REMOTE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

export type RemoteImageBodyReadResult =
  | { status: 'ready'; bytes: Uint8Array }
  | { status: 'too_large'; bytes: number };

type PrefixObserver = (bytes: Uint8Array) => void;

class GrowingPrefix {
  private bytes = new Uint8Array(64);
  private length = 0;

  append(chunk: Uint8Array) {
    while (this.bytes.length < this.length + chunk.length) {
      const grown = new Uint8Array(Math.min(REMOTE_IMAGE_MAX_BYTES, this.bytes.length * 2));
      grown.set(this.bytes.subarray(0, this.length));
      this.bytes = grown;
    }
    this.bytes.set(chunk, this.length);
    this.length += chunk.length;
    return this.bytes.subarray(0, this.length);
  }
}

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
  signal: AbortSignal,
  observePrefix?: PrefixObserver
): Promise<RemoteImageBodyReadResult> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const prefix = observePrefix ? new GrowingPrefix() : null;
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
      if (prefix) observePrefix?.(prefix.append(chunk));
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
  signal: AbortSignal,
  observePrefix?: PrefixObserver
): Promise<RemoteImageBodyReadResult> {
  const contentLength = parseContentLength(response);
  if (contentLength !== null && contentLength > REMOTE_IMAGE_MAX_BYTES) {
    return { status: 'too_large', bytes: contentLength };
  }
  if (response.body) {
    return readStreamBody(response.body, signal, observePrefix);
  }
  const bytes = new Uint8Array(await runWithAbort(response.arrayBuffer(), signal));
  observePrefix?.(bytes);
  return bytes.length > REMOTE_IMAGE_MAX_BYTES
    ? { status: 'too_large', bytes: bytes.length }
    : { status: 'ready', bytes };
}
