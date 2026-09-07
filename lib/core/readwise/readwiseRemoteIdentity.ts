export const READWISE_REMOTE_SOURCE_KEY = 'readwise_remote_source';
export const READWISE_REMOTE_SOURCE_VERSION = 1;

export interface ReadwiseRemoteAnnotationBinding {
  kind: 'highlight' | 'note';
  nodeId: string;
  remoteId: string;
}

export interface ReadwiseRemoteSource {
  connectionRef: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

const READER_LINK = /https?:\/\/(?:read\.)?readwise\.io\/(?:[^\s/()]+\/)?read\/([A-Za-z0-9_-]+)/giu;

export function extractReaderLinkIds(value: string) {
  return [...new Set([...value.matchAll(READER_LINK)]
    .map((match) => match[1])
    .filter((id): id is string => Boolean(id)))];
}

export function normalizeReadwiseRemoteSource(value: unknown): ReadwiseRemoteSource | null {
  const row = record(value);
  const connectionRef = text(row.connectionRef);
  const createdAt = text(row.createdAt);
  const updatedAt = text(row.updatedAt);
  if (!connectionRef || !createdAt || !updatedAt || row.version !== READWISE_REMOTE_SOURCE_VERSION) return null;
  return { connectionRef, createdAt, updatedAt, version: READWISE_REMOTE_SOURCE_VERSION };
}

export function normalizeRemoteAnnotationBindings(value: unknown): ReadwiseRemoteAnnotationBinding[] {
  if (!Array.isArray(value)) return [];
  const result: ReadwiseRemoteAnnotationBinding[] = value.flatMap((item): ReadwiseRemoteAnnotationBinding[] => {
    const row = record(item);
    const nodeId = text(row.nodeId);
    const remoteId = text(row.remoteId);
    const kind = row.kind === 'highlight' || row.kind === 'note' ? row.kind : null;
    return nodeId && remoteId && kind ? [{ kind, nodeId, remoteId }] : [];
  });
  return [...new Map(result.map((item) => [item.remoteId, item])).values()]
    .sort((left, right) => left.remoteId.localeCompare(right.remoteId));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
