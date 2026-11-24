import type { DatabaseMigrationTarget } from './migrationTypes.js';

const pdfStorageKey = "json_extract(resource.value, '$.storage_key')";
const pdfReferences = `json_extract(resource.value, '$.role') = 'reference'
  AND substr(${pdfStorageKey}, 65) = '.pdf'`;

const insertPdfAttachments = `INSERT INTO pdf_attachment_nodes (storage_key, node_id)`;

const addNewReferences = `${insertPdfAttachments}
  SELECT DISTINCT ${pdfStorageKey}, NEW.id FROM json_each(NEW.resource_references) resource
  WHERE ${pdfReferences};`;

/** A local lookup index over node-owned resources, including mounts retained in Trash. */
export const PDF_ATTACHMENT_NODE_INDEX_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pdf_attachment_nodes (
    storage_key TEXT NOT NULL, node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (storage_key, node_id)
  ) WITHOUT ROWID`,
  'CREATE INDEX IF NOT EXISTS idx_pdf_attachment_nodes_node ON pdf_attachment_nodes (node_id)',
  `CREATE TRIGGER IF NOT EXISTS pdf_attachment_nodes_insert AFTER INSERT ON nodes
    WHEN NEW.resource_references <> '[]' BEGIN ${addNewReferences} END`,
  `CREATE TRIGGER IF NOT EXISTS pdf_attachment_nodes_update AFTER UPDATE OF resource_references ON nodes
    WHEN OLD.resource_references IS NOT NEW.resource_references
    BEGIN
      DELETE FROM pdf_attachment_nodes WHERE node_id = OLD.id;
      ${addNewReferences}
    END`
];

export function migratePdfAttachmentNodeIndex(sqlite: DatabaseMigrationTarget) {
  for (const sql of PDF_ATTACHMENT_NODE_INDEX_SCHEMA) sqlite.exec(sql);
  sqlite.exec(`${insertPdfAttachments}
    SELECT DISTINCT ${pdfStorageKey}, owner.id FROM nodes owner, json_each(owner.resource_references) resource
    WHERE owner.resource_references <> '[]' AND ${pdfReferences}
    ON CONFLICT(storage_key, node_id) DO NOTHING`);
}
