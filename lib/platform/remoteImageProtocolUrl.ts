export const REMOTE_IMAGE_PROTOCOL_SCHEME = 'foliole-remote-image';
export const REMOTE_IMAGE_RENDER_VERSION = '3';

export type RemoteImageSourceProvenance = 'learned' | 'node' | 'none';

export interface RemoteImageRenderUrlParts {
  nodeId: string | null;
  persist: boolean;
  retryKey?: string | null;
  sourceOrigin?: string | null;
  sourceProvenance?: RemoteImageSourceProvenance;
  sourceUrl: string;
}

function normalizeOptionalNodeId(nodeId: string | null | undefined) {
  const normalized = nodeId?.trim() ?? '';
  return normalized || null;
}

function normalizeSourceContext(origin: string | null | undefined, provenance: RemoteImageSourceProvenance | undefined) {
  try {
    const parsed = new URL(origin?.trim() ?? '');
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (provenance === 'node' || provenance === 'learned')
    ) {
      return { origin: `${parsed.origin}/`, provenance };
    }
  } catch {
    // Missing or invalid context intentionally produces a direct request.
  }
  return { origin: null, provenance: 'none' as const };
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
  const context = normalizeSourceContext(parts.sourceOrigin, parts.sourceProvenance);
  if (context.origin) {
    url.searchParams.set('origin', context.origin);
    url.searchParams.set('provenance', context.provenance);
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
  const context = normalizeSourceContext(
    parsed.searchParams.get('origin'),
    parsed.searchParams.get('provenance') as RemoteImageSourceProvenance | undefined
  );
  return {
    nodeId,
    persist: parsed.searchParams.get('persist') === '1',
    retryKey: parsed.searchParams.get('retry')?.trim() || null,
    sourceOrigin: context.origin,
    sourceProvenance: context.provenance,
    sourceUrl
  };
}
