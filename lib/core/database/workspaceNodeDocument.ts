import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface WorkspaceNodeDocumentRow extends DatabaseRow {
  content: string;
  hide_title_heading: number;
  id: string;
  reveal: string | null;
}

export function loadWorkspaceNodeDocument(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<WorkspaceNodeDocumentRow>(
    `SELECT id, content, reveal, hide_title_heading
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
  if (!row) {
    return null;
  }
  return {
    nodeId: row.id,
    content: row.content,
    hideTitleHeading: row.hide_title_heading === 1,
    reveal: row.reveal
  };
}
