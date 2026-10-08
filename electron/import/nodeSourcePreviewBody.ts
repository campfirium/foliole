import { loadNodeBodyResolution, NodeBodyUnavailableError } from '../../lib/core/database/nodeBodyResolution.js';
import { openDatabaseConnection } from '../database/connection.js';

export interface SourceNodeRow {
  content: string;
  id: string;
  updated_at: string;
}

export function readSourceNode(nodeId: string): SourceNodeRow | null {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<{ id: string; updated_at: string }>(
    'SELECT id, updated_at FROM nodes WHERE id = ?', [nodeId]);
  if (!row) return null;
  const body = loadNodeBodyResolution(driver, row.id);
  if (!body) throw new NodeBodyUnavailableError([row.id]);
  return { ...row, content: body.content };
}
