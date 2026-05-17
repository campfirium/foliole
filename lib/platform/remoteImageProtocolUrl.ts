export const REMOTE_IMAGE_PROTOCOL_SCHEME = 'foliole-remote-image';
export const REMOTE_IMAGE_RENDER_VERSION = '2';

export interface RemoteImageRenderUrlParts {
  nodeId: string | null;
  persist: boolean;
  retryKey?: string | null;
  sourceUrl: string;
}

function normalizeOptionalNodeId(nodeId: string | null | undefined) {
  const normalized = nodeId?.trim() ?? '';
  return normalized || null;
}

export function buildRemoteImageRenderUrl(parts: RemoteImageRenderUrlParts) {
  const url = new URL(`${REMOTE_IMAGE_PROTOCOL_SCHEME}://render`);
  url.searchParams.set('source', parts.sourceUrl);
  url.searchParams.set('v', REMOTE_IMAGE_RENDER_VERSION);
  const nodeId = normalizeOptionalNodeId(parts.nodeId);
  if (nodeId) {
    url.searchParams.set('nodeId', nodeId);
  }
  const retryKey = parts.retryKey?.trim() ?? '';
  if (retryKey) {
    url.searchParams.set('retry', retryKey);
  }
  if (parts.persist) {
    if (nodeId) {
      url.searchParams.set('persist', '1');
    }
  }
  return url.toString();
}

export function parseRemoteImageRenderUrl(value: string): RemoteImageRenderUrlParts | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${REMOTE_IMAGE_PROTOCOL_SCHEME}:` || parsed.hostname !== 'render') {
    return null;
  }
  const sourceUrl = parsed.searchParams.get('source')?.trim() ?? '';
  if (!sourceUrl) {
    return null;
  }
  const nodeId = normalizeOptionalNodeId(parsed.searchParams.get('nodeId'));
  return {
    nodeId,
    persist: parsed.searchParams.get('persist') === '1',
    retryKey: parsed.searchParams.get('retry')?.trim() || null,
    sourceUrl
  };
}
