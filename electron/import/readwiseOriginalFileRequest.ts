import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
const PDF_MIME = 'application/pdf';
const EPUB_MIME = 'application/epub+zip';
export type OriginalFileIdleWatchdog = ReturnType<typeof createIdleWatchdog>;

export async function consumeReadwiseOriginalFile<T>(
  initialUrl: string, category: 'epub' | 'pdf', dependencies: ReadwiseApiFetchDependencies,
  consume: (response: Response, idle: OriginalFileIdleWatchdog) => Promise<T>
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
      return await consume(response, idle);
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

function validateDeclaredMime(value: string | null, category: 'epub' | 'pdf') {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  const allowed = new Set(category === 'pdf'
    ? [PDF_MIME, 'application/octet-stream']
    : [EPUB_MIME, 'application/zip', 'application/octet-stream']);
  if (mime && !allowed.has(mime)) throw new Error('original_file_mime_mismatch');
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
