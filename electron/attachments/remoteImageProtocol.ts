import { protocol } from 'electron';

import {
  parseRemoteImageRenderUrl,
  REMOTE_IMAGE_PROTOCOL_SCHEME
} from '../../lib/platform/remoteImageProtocolUrl.js';

import { fetchRemoteImageResource, importRemoteImageAttachment } from './remoteImagePipeline.js';

export { REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/remoteImageProtocolUrl.js';

function createRemoteImageResponse(bytes: Uint8Array, mimeType: string) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'content-type': mimeType,
      'cache-control': 'public, max-age=31536000, immutable'
    },
    status: 200
  });
}

export function registerRemoteImageProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: REMOTE_IMAGE_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
}

export function registerRemoteImageProtocol() {
  protocol.handle(REMOTE_IMAGE_PROTOCOL_SCHEME, async (request) => {
    const parts = parseRemoteImageRenderUrl(request.url);
    if (!parts || (parts.persist && !parts.nodeId)) {
      return new Response(null, { status: 400 });
    }

    const fetchResult = await fetchRemoteImageResource(parts.sourceUrl);
    if (fetchResult.status === 'error') {
      return new Response(null, { status: 404 });
    }

    if (parts.persist && parts.nodeId) {
      const importResult = await importRemoteImageAttachment({
        nodeId: parts.nodeId,
        sourceUrl: parts.sourceUrl
      });
      if (importResult.status !== 'imported') {
        return new Response(null, { status: 404 });
      }
    }

    return createRemoteImageResponse(fetchResult.resource.bytes, fetchResult.resource.mimeType);
  });
}
