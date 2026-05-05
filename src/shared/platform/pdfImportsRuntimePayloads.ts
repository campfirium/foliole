export interface RuntimePdfImportInventoryItem {
  lastImportedAt: string;
  latestNodeId: string | null;
  nodeStatus: 'deleted' | 'generated' | 'missing';
  pdfIndexStatus: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdfIndexedAt: string | null;
  sourceFingerprint: string;
  sourceLocator: string;
  sourceName: string;
}

export interface RuntimePdfImportsInventory {
  items: RuntimePdfImportInventoryItem[];
  scannedAt: string;
}

function isPdfIndexStatus(value: unknown): value is RuntimePdfImportInventoryItem['pdfIndexStatus'] {
  return value === null || value === 'failed' || value === 'indexing' || value === 'pending' || value === 'ready';
}

function isPdfNodeStatus(value: unknown): value is RuntimePdfImportInventoryItem['nodeStatus'] {
  return value === 'deleted' || value === 'generated' || value === 'missing';
}

export function toRuntimePdfImportInventoryItem(value: unknown): RuntimePdfImportInventoryItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.last_imported_at !== 'string' ||
    (payload.latest_node_id !== null && typeof payload.latest_node_id !== 'string') ||
    !isPdfNodeStatus(payload.node_status) ||
    !isPdfIndexStatus(payload.pdf_index_status) ||
    (payload.pdf_indexed_at !== null && typeof payload.pdf_indexed_at !== 'string') ||
    typeof payload.source_fingerprint !== 'string' ||
    typeof payload.source_locator !== 'string' ||
    typeof payload.source_name !== 'string'
  ) {
    return null;
  }
  return {
    lastImportedAt: payload.last_imported_at,
    latestNodeId: payload.latest_node_id,
    nodeStatus: payload.node_status,
    pdfIndexedAt: payload.pdf_indexed_at,
    pdfIndexStatus: payload.pdf_index_status,
    sourceFingerprint: payload.source_fingerprint,
    sourceLocator: payload.source_locator,
    sourceName: payload.source_name
  };
}

export function toRuntimePdfImportsInventory(value: unknown): RuntimePdfImportsInventory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.items) || typeof payload.scanned_at !== 'string') {
    return null;
  }
  const items = payload.items.map(toRuntimePdfImportInventoryItem);
  if (items.some((item) => !item)) {
    return null;
  }
  return {
    items: items.filter((item): item is RuntimePdfImportInventoryItem => Boolean(item)),
    scannedAt: payload.scanned_at
  };
}
