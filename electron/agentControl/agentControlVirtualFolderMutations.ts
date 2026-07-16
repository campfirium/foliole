import { randomUUID } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { rewriteAgentControlNodeSnapshot } from './agentControlMaterialMutations.js';
import type { AgentVirtualFolderSummary } from './agentControlVirtualFolders.js';
import {
  readAgentVirtualFolderRow,
  readAgentVirtualFolderTopicRows,
  readAgentVirtualFolderTopics,
  VIRTUAL_ROOT_NODE_ID
} from './agentControlVirtualFolders.js';

export interface AgentVirtualFolderMutationResult {
  added?: string[];
  folder?: AgentVirtualFolderSummary;
  folder_id: string;
  removed?: string[];
  reordered_count?: number;
  skipped?: Array<{ id: string; reason: 'already_present' | 'deleted' | 'not_found' }>;
}

export class AgentVirtualFolderMutationError extends Error {
  constructor(readonly category: 'conflict' | 'invalid_request' | 'not_found', readonly statusCode: 400 | 404 | 409) {
    super(category);
  }
}

export function createAgentControlVirtualFolder(input: { title: string }) {
  const title = normalizeTitle(input.title);
  return openDatabaseConnection().driver.transaction(() => {
    ensureUniqueTitle(title);
    const now = new Date().toISOString();
    const id = randomUUID();
    const positionRow = openDatabaseConnection().driver.queryOne<{ position: number } & DatabaseRow>(
      'SELECT COALESCE(MAX(position), -1) AS position FROM node_order'
    );
    upsertNodeSnapshot({
      anchorLink: null, content: '', createdAt: now, hideTitleHeading: false, imageRegions: null,
      isTitleManual: true, kind: 'folder', manualChildOrder: [], nodeId: id, parentNodeId: VIRTUAL_ROOT_NODE_ID,
      position: (positionRow?.position ?? -1) + 1, reveal: null, title, updatedAt: now,
      virtualFilter: createManualVirtualNodeFilter()
    });
    return { folder: { created_at: now, id, item_count: 0, title, updated_at: now }, folder_id: id };
  });
}

export function addAgentControlVirtualFolderItems(input: { folderId: string; materialIds: string[] }) {
  return mutateManualMembership(input.folderId, input.materialIds, true);
}

export function removeAgentControlVirtualFolderItems(input: { folderId: string; materialIds: string[] }) {
  return mutateManualMembership(input.folderId, input.materialIds, false);
}

export function reorderAgentControlVirtualFolderItems(input: { folderId: string; materialIds: string[] }) {
  return openDatabaseConnection().driver.transaction(() => {
    const folder = requireFolder(input.folderId);
    const currentIds = readAgentVirtualFolderTopics(folder.id).map((row) => row.id);
    if (!hasSameItemSet(currentIds, input.materialIds)) throw new AgentVirtualFolderMutationError('conflict', 409);
    const storedIds = parseManualChildOrder(folder.manual_child_order) ?? [];
    const visibleIds = new Set(currentIds);
    const hiddenIds = storedIds.filter((id) => !visibleIds.has(id));
    rewriteAgentControlNodeSnapshot({ id: input.folderId, manualChildOrder: [...input.materialIds, ...hiddenIds] });
    return { folder_id: input.folderId, reordered_count: input.materialIds.length };
  });
}

export function ensureUniqueTitle(title: string, exceptId?: string) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string } & DatabaseRow>(
    `SELECT id FROM nodes WHERE parent_id = ? AND kind = 'folder' AND deleted_at IS NULL AND title = ? ${exceptId ? 'AND id <> ?' : ''} LIMIT 1`,
    exceptId ? [VIRTUAL_ROOT_NODE_ID, title, exceptId] : [VIRTUAL_ROOT_NODE_ID, title]
  );
  if (row) throw new AgentVirtualFolderMutationError('conflict', 409);
}

export function normalizeTitle(value: string) {
  const title = value.trim();
  if (!title || /[\r\n]/.test(title)) throw new AgentVirtualFolderMutationError('invalid_request', 400);
  return title;
}

function mutateManualMembership(folderId: string, ids: string[], add: boolean): AgentVirtualFolderMutationResult {
  return openDatabaseConnection().driver.transaction(() => {
    const folder = requireFolder(folderId);
    const currentMemberIds = parseManualChildOrder(folder.manual_child_order) ?? [];
    const activeRows = readAgentVirtualFolderTopicRows(ids);
    const activeById = new Map(activeRows.map((row) => [row.id, row]));
    const knownRows = readKnownNodeStates(ids);
    const result: AgentVirtualFolderMutationResult = { folder_id: folderId, ...(add ? { added: [] } : { removed: [] }), skipped: [] };
    const now = new Date().toISOString();
    for (const id of ids) {
      const present = currentMemberIds.includes(id) || result.added?.includes(id);
      if (add && present) {
        result.skipped!.push({ id, reason: 'already_present' });
        continue;
      }
      if (!add && !present) {
        result.skipped!.push({ id, reason: 'not_found' });
        continue;
      }
      if (add && !activeById.has(id)) {
        result.skipped!.push({ id, reason: knownRows.get(id) ? 'deleted' : 'not_found' });
        continue;
      }
      (add ? result.added : result.removed)!.push(id);
    }
    updateManualOrderAfterMembershipChange(folder.id, currentMemberIds, result, add, now);
    return result;
  });
}

function updateManualOrderAfterMembershipChange(
  folderId: string,
  currentMemberIds: string[],
  result: AgentVirtualFolderMutationResult,
  add: boolean,
  updatedAt: string
) {
  const changedIds = (add ? result.added : result.removed) ?? [];
  if (changedIds.length === 0) return;
  const nextOrder = add
    ? [...currentMemberIds, ...changedIds.filter((id) => !currentMemberIds.includes(id))]
    : currentMemberIds.filter((id) => !changedIds.includes(id));
  rewriteAgentControlNodeSnapshot({ id: folderId, manualChildOrder: nextOrder, updatedAt });
}

function requireFolder(id: string) {
  const row = readAgentVirtualFolderRow(id);
  if (!row) throw new AgentVirtualFolderMutationError('not_found', 404);
  return row;
}

function readKnownNodeStates(ids: string[]) {
  if (ids.length === 0) return new Map<string, boolean>();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<{ deleted_at: string | null; id: string } & DatabaseRow>(
    `SELECT id, deleted_at FROM nodes WHERE id IN (${placeholders})`, ids
  );
  return new Map(rows.map((row) => [row.id, Boolean(row.deleted_at)]));
}

function hasSameItemSet(current: string[], requested: string[]) {
  return current.length === requested.length && new Set(current).size === requested.length && requested.every((id) => current.includes(id));
}
