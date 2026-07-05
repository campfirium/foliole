import { randomUUID } from 'node:crypto';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

import type { AgentVirtualFolderSummary } from './agentControlVirtualFolders.js';

export interface AgentVirtualFolderMutationResult {
  added?: string[];
  folder?: AgentVirtualFolderSummary;
  folder_id: string;
  removed?: string[];
  reordered_count?: number;
  restored?: string[];
  skipped?: Array<{ id: string; reason: 'already_present' | 'deleted' | 'not_found' }>;
}

interface FolderRow extends DatabaseRow {
  created_at: string;
  description: string;
  id: string;
  item_count: number;
  title: string;
  updated_at: string;
}

interface ItemRow extends DatabaseRow {
  id: string;
  material_node_id: string;
  position: number;
}

interface MaterialRow extends DatabaseRow {
  deleted_at: string | null;
  id: string;
}

export class AgentVirtualFolderMutationError extends Error {
  constructor(
    readonly category: 'conflict' | 'invalid_request' | 'not_found',
    readonly statusCode: 400 | 404 | 409
  ) {
    super(category);
  }
}

export function createAgentControlVirtualFolder(input: { description?: string; title: string }) {
  return openDatabaseConnection().driver.transaction((driver) => {
    const now = new Date().toISOString();
    const id = randomUUID();
    driver.execute(
      `INSERT INTO virtual_folders (id, title, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.title, input.description ?? '', now, now]
    );
    const folder = readFolderOrThrow(driver, id);
    return { folder, folder_id: id } satisfies AgentVirtualFolderMutationResult;
  });
}

export function addAgentControlVirtualFolderItems(input: { folderId: string; materialIds: string[] }) {
  return openDatabaseConnection().driver.transaction((driver) => {
    readFolderOrThrow(driver, input.folderId);
    const now = new Date().toISOString();
    let nextPosition = readMaxPosition(driver, input.folderId) + 10;
    const materials = readMaterials(driver, input.materialIds);
    const result: AgentVirtualFolderMutationResult = { added: [], folder_id: input.folderId, restored: [], skipped: [] };
    for (const materialId of input.materialIds) {
      const material = materials.get(materialId);
      if (!material) {
        result.skipped?.push({ id: materialId, reason: 'not_found' });
        continue;
      }
      if (material.deleted_at) {
        result.skipped?.push({ id: materialId, reason: 'deleted' });
        continue;
      }
      const existing = readItemByMaterial(driver, input.folderId, materialId, false);
      if (existing) {
        result.skipped?.push({ id: materialId, reason: 'already_present' });
        continue;
      }
      const deleted = readItemByMaterial(driver, input.folderId, materialId, true);
      if (deleted) {
        restoreItem(driver, deleted.id, nextPosition, now);
        result.restored?.push(deleted.id);
      } else {
        const itemId = randomUUID();
        insertItem(driver, { folderId: input.folderId, itemId, materialId, now, position: nextPosition });
        result.added?.push(itemId);
      }
      nextPosition += 10;
    }
    touchFolder(driver, input.folderId, now);
    return result;
  });
}

export function removeAgentControlVirtualFolderItems(input: { folderId: string; itemIds: string[] }) {
  return openDatabaseConnection().driver.transaction((driver) => {
    readFolderOrThrow(driver, input.folderId);
    const now = new Date().toISOString();
    const result: AgentVirtualFolderMutationResult = { folder_id: input.folderId, removed: [], skipped: [] };
    for (const itemId of input.itemIds) {
      const item = driver.queryOne<ItemRow>(
        `SELECT id, material_node_id, position FROM virtual_folder_items
         WHERE id = ? AND folder_id = ? AND deleted_at IS NULL`,
        [itemId, input.folderId]
      );
      if (!item) {
        result.skipped?.push({ id: itemId, reason: 'not_found' });
        continue;
      }
      driver.execute('UPDATE virtual_folder_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, itemId]);
      result.removed?.push(itemId);
    }
    touchFolder(driver, input.folderId, now);
    return result;
  });
}

export function reorderAgentControlVirtualFolderItems(input: { folderId: string; itemIds: string[] }) {
  return openDatabaseConnection().driver.transaction((driver) => {
    readFolderOrThrow(driver, input.folderId);
    const current = driver.queryAll<ItemRow>(
      `SELECT id, material_node_id, position FROM virtual_folder_items
       WHERE folder_id = ? AND deleted_at IS NULL
       ORDER BY position ASC, id ASC`,
      [input.folderId]
    );
    if (!hasSameItemSet(current.map((item) => item.id), input.itemIds)) {
      throw new AgentVirtualFolderMutationError('conflict', 409);
    }
    const now = new Date().toISOString();
    input.itemIds.forEach((itemId, index) => {
      driver.execute('UPDATE virtual_folder_items SET position = ?, updated_at = ? WHERE id = ?', [(index + 1) * 10, now, itemId]);
    });
    touchFolder(driver, input.folderId, now);
    return { folder_id: input.folderId, reordered_count: input.itemIds.length } satisfies AgentVirtualFolderMutationResult;
  });
}

function readFolderOrThrow(driver: DatabaseDriver, folderId: string) {
  const row = driver.queryOne<FolderRow>(
    `SELECT vf.id, vf.title, vf.description, vf.created_at, vf.updated_at,
            COUNT(vfi.id) AS item_count
     FROM virtual_folders vf
     LEFT JOIN virtual_folder_items vfi ON vfi.folder_id = vf.id AND vfi.deleted_at IS NULL
     WHERE vf.id = ? AND vf.deleted_at IS NULL
     GROUP BY vf.id`,
    [folderId]
  );
  if (!row) throw new AgentVirtualFolderMutationError('not_found', 404);
  return {
    created_at: row.created_at,
    description: row.description,
    id: row.id,
    item_count: row.item_count,
    title: row.title,
    updated_at: row.updated_at
  };
}

function readMaterials(driver: DatabaseDriver, ids: string[]) {
  if (ids.length === 0) return new Map<string, MaterialRow>();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = driver.queryAll<MaterialRow>(`SELECT id, deleted_at FROM nodes WHERE id IN (${placeholders})`, ids);
  return new Map(rows.map((row) => [row.id, row]));
}

function readItemByMaterial(driver: DatabaseDriver, folderId: string, materialId: string, deleted: boolean) {
  return driver.queryOne<ItemRow>(
    `SELECT id, material_node_id, position FROM virtual_folder_items
     WHERE folder_id = ? AND material_node_id = ? AND deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}
     ORDER BY updated_at DESC, id ASC
     LIMIT 1`,
    [folderId, materialId]
  );
}

function readMaxPosition(driver: DatabaseDriver, folderId: string) {
  const row = driver.queryOne<{ position: number } & DatabaseRow>(
    'SELECT COALESCE(MAX(position), 0) AS position FROM virtual_folder_items WHERE folder_id = ? AND deleted_at IS NULL',
    [folderId]
  );
  return row?.position ?? 0;
}

function insertItem(driver: DatabaseDriver, input: { folderId: string; itemId: string; materialId: string; now: string; position: number }) {
  driver.execute(
    `INSERT INTO virtual_folder_items (id, folder_id, material_node_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.itemId, input.folderId, input.materialId, input.position, input.now, input.now]
  );
}

function restoreItem(driver: DatabaseDriver, itemId: string, position: number, now: string) {
  driver.execute(
    'UPDATE virtual_folder_items SET deleted_at = NULL, position = ?, updated_at = ? WHERE id = ?',
    [position, now, itemId]
  );
}

function touchFolder(driver: DatabaseDriver, folderId: string, now: string) {
  driver.execute('UPDATE virtual_folders SET updated_at = ? WHERE id = ?', [now, folderId]);
}

function hasSameItemSet(current: string[], requested: string[]) {
  if (current.length !== requested.length) return false;
  const currentSet = new Set(current);
  return requested.every((id) => currentSet.has(id));
}
