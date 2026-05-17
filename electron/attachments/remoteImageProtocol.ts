import { protocol } from 'electron';

import {
  parseRemoteImageRenderUrl,
  REMOTE_IMAGE_PROTOCOL_SCHEME
} from '../../lib/platform/remoteImageProtocolUrl.js';

import { fetchRemoteImageResource, importRemoteImageAttachment } from './remoteImagePipeline.js';
import { resolveRemoteImageSourceContext } from './remoteImageSourceContext.js';

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

function createRemoteImageErrorResponse(status: number, errorCode = 'download_failed') {
  return new Response(null, {
    headers: {
      'cache-control': 'no-store',
      'x-foliole-image-error': errorCode
    },
    status
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
      return createRemoteImageErrorResponse(400);
    }

    const sourceContext = resolveRemoteImageSourceContext(parts.nodeId, parts.sourceUrl);
    const fetchResult = await fetchRemoteImageResource(parts.sourceUrl, {
      bypassFailureCache: Boolean(parts.retryKey),
      sourceOrigin: sourceContext.sourceOrigin
    });
    if (fetchResult.status === 'error') {
      return createRemoteImageErrorResponse(404, fetchResult.error.error_code);
    }

    if (parts.persist && parts.nodeId) {
      try {
        await importRemoteImageAttachment({
          nodeId: parts.nodeId,
          sourceUrl: parts.sourceUrl
        });
      } catch {
        // Rendering the already fetched remote image must not depend on attachment persistence.
      }
    }

    return createRemoteImageResponse(fetchResult.resource.bytes, fetchResult.resource.mimeType);
  });
}
