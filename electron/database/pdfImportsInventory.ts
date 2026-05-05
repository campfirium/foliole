import {
  loadPdfImportsInventory as loadPdfImportsInventoryViaDriver,
  type PdfImportInventoryItem
} from '../../lib/core/database/pdfImportsInventory.js';

import { openDatabaseConnection } from './connection.js';

export type { PdfImportInventoryItem };

export function loadPdfImportsInventory(limit?: number) {
  return loadPdfImportsInventoryViaDriver(openDatabaseConnection().driver, limit);
}
