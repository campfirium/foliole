import { promises as fs } from 'node:fs';

import { protocol } from 'electron';

import { ATTACHMENT_PROTOCOL_SCHEME, parseAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { resolveAttachmentFile } from './resourceResolver.js';

export { ATTACHMENT_PROTOCOL_SCHEME } from './attachmentAssetUrl.js';

export function registerAttachmentProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
}

export function registerAttachmentProtocol() {
  protocol.handle(ATTACHMENT_PROTOCOL_SCHEME, async (request) => {
    const attachmentId = parseAttachmentAssetUrl(request.url);
    if (!attachmentId) {
      return new Response(null, { status: 400 });
    }

    const resolved = resolveAttachmentFile(attachmentId);
    if (resolved.status !== 'ready') {
      return new Response(null, { status: 404 });
    }

    const body = await fs.readFile(resolved.filePath);
    return new Response(body, {
      headers: {
        'content-type': resolved.mimeType ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable'
      },
      status: 200
    });
  });
}
