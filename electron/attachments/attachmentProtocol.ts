import { protocol } from 'electron';

import { ATTACHMENT_PROTOCOL_SCHEME, parseAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { resolveAttachmentFile } from './resourceResolver.js';

export { ATTACHMENT_PROTOCOL_SCHEME } from './attachmentAssetUrl.js';

export function registerAttachmentProtocol() {
  protocol.handle(ATTACHMENT_PROTOCOL_SCHEME, async (request) => {
    const description = parseAttachmentAssetUrl(request.url);
    if (!description) {
      return new Response(null, { status: 400 });
    }

    const resolved = resolveAttachmentFile(description);
    if (resolved.status !== 'ready') {
      return new Response(null, { status: 404 });
    }

    const range = parseByteRange(request.headers.get('range'), resolved.bytes.length);
    const body = range ? resolved.bytes.subarray(range.start, range.end + 1) : resolved.bytes;
    const headers: Record<string, string> = {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        'content-type': resolved.mimeType ?? 'application/octet-stream',
        'content-length': String(body.length),
        'cache-control': 'public, max-age=31536000, immutable'
    };
    if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${resolved.bytes.length}`;
    return new Response(Uint8Array.from(body), {
      headers,
      status: range ? 206 : 200
    });
  });
}

function parseByteRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size) return null;
  return { end: Math.min(requestedEnd, size - 1), start };
}
