import fs from 'node:fs';

import { protocol } from 'electron';

import { ATTACHMENT_PROTOCOL_SCHEME, parseAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { resolveAttachmentFileForSync } from './resourceResolver.js';

export { ATTACHMENT_PROTOCOL_SCHEME } from './attachmentAssetUrl.js';

// The content check belongs to the resolve command that hands out this URL: a stored file whose bytes no
// longer match resolves as missing there and asks attachment sync for a good copy. Serving the URL only
// re-checks the stored regular file and its type, then reads the requested bytes instead of the whole file.
export function registerAttachmentProtocol() {
  protocol.handle(ATTACHMENT_PROTOCOL_SCHEME, async (request) => {
    const resource = parseAttachmentAssetUrl(request.url);
    if (!resource) {
      return new Response(null, { status: 400 });
    }

    const resolved = resolveAttachmentFileForSync(resource.storageKey);
    if (resolved.status !== 'ready') {
      return new Response(null, { status: 404 });
    }

    const size = resolved.sizeBytes;
    const range = parseByteRange(request.headers.get('range'), size);
    const start = range?.start ?? 0;
    const body = await readFileRange(resolved.filePath, start, range ? range.end - start + 1 : size);
    if (!body) return new Response(null, { status: 404 });
    const headers: Record<string, string> = {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        'content-type': resolved.mimeType ?? 'application/octet-stream',
        'content-length': String(body.length),
        'cache-control': 'public, max-age=31536000, immutable'
    };
    if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`;
    return new Response(body, {
      headers,
      status: range ? 206 : 200
    });
  });
}

async function readFileRange(filePath: string, start: number, length: number) {
  try {
    const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const bytes = new Uint8Array(length);
      let offset = 0;
      while (offset < length) {
        const { bytesRead } = await handle.read(bytes, offset, length - offset, start + offset);
        if (bytesRead === 0) return null;
        offset += bytesRead;
      }
      return bytes;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
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
