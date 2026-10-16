import type { DbPort } from '../sync/dbPort.js';
import { PDF_TEXT_ARTIFACT_SCHEMA } from '../sync/pdfTextArtifact.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const statements = [PDF_TEXT_ARTIFACT_SCHEMA,
  ...['insert', 'update', 'delete'].map(action => `DROP TRIGGER IF EXISTS trg_sync_identity_pdf_page_text_${action}`),
  "DELETE FROM sync_object_state WHERE object_type = 'pdf_page_text'"
];
export function migratePdfTextArtifacts(sqlite: DatabaseMigrationTarget) {
  for (const sql of statements) sqlite.exec(sql);
}
export async function migrateCompanionPdfTextArtifacts(db: DbPort) {
  for (const sql of statements) await db.run(sql);
}
