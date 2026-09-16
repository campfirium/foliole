import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';

const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
const MAX_ORIGINAL_FILE_BYTES = 100 * 1024 * 1024;
const PDF_MIME = 'application/pdf';
const EPUB_MIME = 'application/epub+zip';
type OriginalFileCategory = 'epub' | 'pdf';

export async function downloadReadwiseOriginalFile(
  initialUrl: string,
  category: OriginalFileCategory,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let url = requireS3Url(initialUrl);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const idle = createIdleWatchdog(dependencies.originalFileIdleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      dependencies.signal);
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: idle.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('original_file_redirect_invalid');
        url = requireS3Url(new URL(location, url).toString());
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`original_file_http_${response.status}`);
      validateDeclaredMime(response.headers.get('content-type'), category);
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > MAX_ORIGINAL_FILE_BYTES) {
        throw new Error('original_file_too_large');
      }
      const bytes = await readBoundedBody(response.body, idle);
      validateFileBytes(bytes, category);
      return bytes;
    } catch (error) {
      if (idle.didExpire()) throw new Error('original_file_download_stalled');
      throw error;
    } finally {
      idle.dispose();
    }
  }
  throw new Error('original_file_redirect_limit');
}

function createIdleWatchdog(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);
  };
  touch();
  return {
    didExpire: () => expired,
    dispose: () => clearTimeout(timer),
    signal: parent ? AbortSignal.any([parent, controller.signal]) : controller.signal,
    touch
  };
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  idle: ReturnType<typeof createIdleWatchdog>
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

function validateDeclaredMime(value: string | null, category: OriginalFileCategory) {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  const allowed = new Set(category === 'pdf'
    ? [PDF_MIME, 'application/octet-stream']
    : [EPUB_MIME, 'application/zip', 'application/octet-stream']);
  if (mime && !allowed.has(mime)) throw new Error('original_file_mime_mismatch');
}

function validateFileBytes(bytes: Uint8Array, category: OriginalFileCategory) {
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512)));
  const valid = category === 'pdf'
    ? prefix.subarray(0, 5).toString() === '%PDF-'
    : prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!valid) throw new Error('original_file_signature_mismatch');
}

function requireS3Url(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password
    || !(host === 's3.amazonaws.com' || host.endsWith('.amazonaws.com'))) {
    throw new Error('original_file_url_rejected');
  }
  return url.toString();
}
