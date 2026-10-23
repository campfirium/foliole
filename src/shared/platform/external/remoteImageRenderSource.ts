import { Capacitor } from '@capacitor/core';

import {
  buildRemoteImageRenderUrl,
  type RemoteImageRenderUrlParts
} from '../../../../lib/platform/remoteImageProtocolUrl';

// Only the desktop host handles the remote image protocol; native companion WebViews load the original URL.
export function resolveRemoteImageRenderSource(parts: RemoteImageRenderUrlParts) {
  if (Capacitor.isNativePlatform()) return parts.sourceUrl;
  return buildRemoteImageRenderUrl(parts);
}
