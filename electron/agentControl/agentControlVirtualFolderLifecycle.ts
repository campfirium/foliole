import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

import { AgentVirtualFolderMutationError } from './agentControlVirtualFolderMutations.js';

interface FolderRow extends DatabaseRow {
  deleted_at: string | null;
  description: string;
  id: string;
  title: string;
  updated_at: string;
}

export function updateAgentControlVirtualFolder(input: {
  description?: string;
  expectedUpdatedAt: string;
  id: string;
  title?: string;
}) {
  const row = readFolder(input.id);
  requireState(row, false, input.expectedUpdatedAt);
  const title = input.title?.trim() ?? row.title;
  if (!title) throw new AgentVirtualFolderMutationError('invalid_request', 400);
  const description = input.description?.trim() ?? row.description;
  const updatedAt = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    'UPDATE virtual_folders SET title = ?, description = ?, updated_at = ? WHERE id = ?',
    [title, description, updatedAt, input.id]
  );
  return { description, folder_id: input.id, title, updated_at: updatedAt };
}

export function softDeleteAgentControlVirtualFolder(input: { expectedUpdatedAt: string; id: string }) {
  const row = readFolder(input.id);
  requireState(row, false, input.expectedUpdatedAt);
  const deletedAt = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    'UPDATE virtual_folders SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [deletedAt, deletedAt, input.id]
  );
  return { deleted: true, deleted_at: deletedAt, folder_id: input.id };
}

export function restoreAgentControlVirtualFolder(input: { expectedUpdatedAt: string; id: string }) {
  const row = readFolder(input.id);
  requireState(row, true, input.expectedUpdatedAt);
  const updatedAt = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    'UPDATE virtual_folders SET deleted_at = NULL, updated_at = ? WHERE id = ?',
    [updatedAt, input.id]
  );
  return { folder_id: input.id, restored: true, updated_at: updatedAt };
}

function readFolder(id: string) {
  const row = openDatabaseConnection().driver.queryOne<FolderRow>(
    'SELECT id, title, description, updated_at, deleted_at FROM virtual_folders WHERE id = ?',
    [id]
  );
  if (!row) throw new AgentVirtualFolderMutationError('not_found', 404);
  return row;
}

function requireState(row: FolderRow, deleted: boolean, expectedUpdatedAt: string) {
  if (Boolean(row.deleted_at) !== deleted || row.updated_at !== expectedUpdatedAt) {
    throw new AgentVirtualFolderMutationError('conflict', 409);
  }
}
