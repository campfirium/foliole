import { protocol } from 'electron';

import {
  parseRemoteImageRenderUrl,
  REMOTE_IMAGE_PROTOCOL_SCHEME
} from '../../lib/platform/remoteImageProtocolUrl.js';

import { fetchRemoteImageResource, importRemoteImageAttachment } from './remoteImagePipeline.js';



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

function createRemoteImageErrorResponse(status: number, errorCode = 'download_failed') {
  return new Response(null, {
    headers: {
      'cache-control': 'no-store',
      'x-foliole-image-error': errorCode
    },
    status
  });
}

export function registerRemoteImageProtocol() {
  protocol.handle(REMOTE_IMAGE_PROTOCOL_SCHEME, async (request) => {
    const parts = parseRemoteImageRenderUrl(request.url);
    if (!parts || (parts.persist && !parts.nodeId)) {
      return createRemoteImageErrorResponse(400);
    }

    const fetchResult = await fetchRemoteImageResource(parts.sourceUrl, {
      bypassFailureCache: Boolean(parts.retryKey),
      sourceOrigin: parts.sourceOrigin ?? null
    });
    if (fetchResult.status === 'error') {
      return createRemoteImageErrorResponse(404, fetchResult.error.error_code);
    }

    const response = createRemoteImageResponse(fetchResult.resource.bytes, fetchResult.resource.mimeType);
    if (parts.persist && parts.nodeId) {
      setImmediate(() => {
        void importRemoteImageAttachment({
          nodeId: parts.nodeId!,
          sourceOrigin: parts.sourceOrigin ?? null,
          sourceUrl: parts.sourceUrl
        }).catch(() => undefined);
      });
    }
    return response;
  });
}
