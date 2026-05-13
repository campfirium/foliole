export const REMOTE_IMAGE_PROTOCOL_SCHEME = 'foliole-remote-image';

export interface RemoteImageRenderUrlParts {
  nodeId: string | null;
  persist: boolean;
  sourceUrl: string;
}

function normalizeOptionalNodeId(nodeId: string | null | undefined) {
  const normalized = nodeId?.trim() ?? '';
  return normalized || null;
}

export function buildRemoteImageRenderUrl(parts: RemoteImageRenderUrlParts) {
  const url = new URL(`${REMOTE_IMAGE_PROTOCOL_SCHEME}://render`);
  url.searchParams.set('source', parts.sourceUrl);
  if (parts.persist) {
    const nodeId = normalizeOptionalNodeId(parts.nodeId);
    if (nodeId) {
      url.searchParams.set('nodeId', nodeId);
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
    sourceUrl
  };
}
