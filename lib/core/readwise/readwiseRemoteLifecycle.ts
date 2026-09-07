export const READWISE_RECONCILE_SCOPE_VERSION = 1;

export type ReadwiseRemoteFact = 'deleted' | 'missing' | 'present' | 'unconfirmed';

export interface ReadwiseReconcileScope {
  readerLocation: 'all' | 'archive' | 'feed' | 'later' | 'new' | 'shortlist';
  version: number;
}

export interface ReadwiseRemoteLifecycleState {
  checkedAt: string | null;
  connectionRef: string;
  export: 'deleted' | 'present' | 'unconfirmed';
  reader: 'missing' | 'present' | 'unconfirmed';
  scope: ReadwiseReconcileScope;
}

export interface ReadwiseReconcileExportHighlight {
  externalId: string;
  isDeleted: boolean;
}

export interface ReadwiseReconcileExportBook {
  externalId: string;
  highlights: ReadwiseReconcileExportHighlight[];
  isDeleted: boolean;
  source: string;
}

export const ALL_READWISE_RECONCILE_SCOPE: ReadwiseReconcileScope = {
  readerLocation: 'all',
  version: READWISE_RECONCILE_SCOPE_VERSION
};

export function normalizeReadwiseRemoteLifecycle(value: unknown): ReadwiseRemoteLifecycleState | null {
  const row = record(value);
  const connectionRef = text(row.connectionRef);
  const scope = normalizeReadwiseReconcileScope(row.scope);
  const reader = row.reader === 'missing' || row.reader === 'present' || row.reader === 'unconfirmed'
    ? row.reader : null;
  const exported = row.export === 'deleted' || row.export === 'present' || row.export === 'unconfirmed'
    ? row.export : null;
  if (!connectionRef || !scope || !reader || !exported) return null;
  return { checkedAt: text(row.checkedAt), connectionRef, export: exported, reader, scope };
}

export function normalizeReadwiseReconcileScope(value: unknown): ReadwiseReconcileScope | null {
  const row = record(value);
  const location = row.readerLocation;
  if (row.version !== READWISE_RECONCILE_SCOPE_VERSION || !isReaderLocation(location)) return null;
  return { readerLocation: location, version: READWISE_RECONCILE_SCOPE_VERSION };
}

export function normalizeReadwiseReconcileReaderDocument(value: unknown) {
  const row = record(value);
  const id = text(row.id);
  const category = text(row.category);
  return id ? { category, id } : null;
}

export function normalizeReadwiseReconcileExportBook(value: unknown): ReadwiseReconcileExportBook | null {
  const row = record(value);
  const externalId = text(row.external_id);
  const source = text(row.source);
  if (!externalId || !source) return null;
  return {
    externalId,
    highlights: array(row.highlights).flatMap((item) => {
      const highlight = record(item);
      const highlightId = text(highlight.external_id);
      return highlightId ? [{ externalId: highlightId, isDeleted: highlight.is_deleted === true }] : [];
    }),
    isDeleted: row.is_deleted === true,
    source
  };
}

export function isReadwiseBodyCategory(value: string | null) {
  return value !== 'highlight' && value !== 'note';
}

function isReaderLocation(value: unknown): value is ReadwiseReconcileScope['readerLocation'] {
  return value === 'all' || value === 'archive' || value === 'feed' || value === 'later' ||
    value === 'new' || value === 'shortlist';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
