import type { PdfImportInventoryItem } from '../database/pdfImportsInventory.js';
import { loadPdfImportsInventory } from '../database/pdfImportsInventory.js';

function toNativePdfImportInventoryItem(item: PdfImportInventoryItem) {
  return {
    last_imported_at: item.lastImportedAt,
    latest_node_id: item.latestNodeId,
    node_status: item.nodeStatus,
    pdf_index_status: item.pdfIndexStatus,
    pdf_indexed_at: item.pdfIndexedAt,
    source_fingerprint: item.sourceFingerprint,
    source_locator: item.sourceLocator,
    source_name: item.sourceName
  };
}

export async function toNativePdfImportsInventory() {
  return {
    items: loadPdfImportsInventory().map(toNativePdfImportInventoryItem),
    scanned_at: new Date().toISOString()
  };
}
