import type { DatabaseBindValue, DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeAssistantProviderId,
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadIndexStatus,
  NativeAssistantThreadOpeningLocation,
  NativeAssistantThreadReadState
} from '../../lib/platform/nativeAssistantContract.js';

import { openDatabaseConnection } from './connection.js';

const DEFAULT_PROVIDER: NativeAssistantProviderId = 'codex-app-server';
const TITLE_LIMIT = 80;
const PREVIEW_LIMIT = 160;

interface AssistantThreadIndexRow extends DatabaseRow {
  archived_at: string | null;
  created_at: string;
  deleted_at: string | null;
  last_opened_at: string;
  location_node_id: string | null;
  location_type: string;
  preview: string;
  provider: NativeAssistantProviderId;
  provider_thread_id: string;
  read_error: string | null;
  read_state: NativeAssistantThreadReadState;
  status: NativeAssistantThreadIndexStatus;
  title: string;
  updated_at: string;
}

export interface AssistantThreadIndexUpsertInput {
  location: NativeAssistantThreadOpeningLocation;
  message: string;
  provider?: NativeAssistantProviderId;
  providerThreadId: string;
  now?: string;
}

export interface AssistantThreadIndexListInput {
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  location?: NativeAssistantThreadOpeningLocation;
}

export function upsertAssistantThreadIndex(input: AssistantThreadIndexUpsertInput): NativeAssistantThreadIndexRecord {
  const location = normalizeOpeningLocation(input.location);
  const providerThreadId = normalizeRequiredString(input.providerThreadId, 'providerThreadId');
  const now = input.now ?? new Date().toISOString();
  const title = truncateDisplayText(input.message, TITLE_LIMIT) || 'Untitled thread';
  const preview = truncateDisplayText(input.message, PREVIEW_LIMIT);
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const row = locationToColumns(location);

  openDatabaseConnection().driver.execute(
    `INSERT INTO assistant_thread_index (
       provider, provider_thread_id, location_type, location_node_id, title, preview,
       status, read_state, read_error, created_at, updated_at, last_opened_at,
       archived_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'not_requested', NULL, ?, ?, ?, NULL, NULL)
     ON CONFLICT(provider, provider_thread_id) DO UPDATE SET
       location_type = excluded.location_type,
       location_node_id = excluded.location_node_id,
       title = excluded.title,
       preview = excluded.preview,
       status = 'active',
       updated_at = excluded.updated_at,
       last_opened_at = excluded.last_opened_at,
       archived_at = NULL,
       deleted_at = NULL`,
    [provider, providerThreadId, row.type, row.nodeId, title, preview, now, now, now]
  );

  return readAssistantThreadIndexRecord(provider, providerThreadId);
}

export function listAssistantThreadIndex(input: AssistantThreadIndexListInput = {}): NativeAssistantThreadIndexRecord[] {
  const filters: string[] = [];
  const params: DatabaseBindValue[] = [];
  if (!input.includeArchived) filters.push("status != 'archived'");
  if (!input.includeDeleted) filters.push("status != 'deleted'");
  if (input.location) {
    const row = locationToColumns(normalizeOpeningLocation(input.location));
    filters.push('location_type = ?');
    params.push(row.type);
    filters.push(row.nodeId === null ? 'location_node_id IS NULL' : 'location_node_id = ?');
    if (row.nodeId !== null) params.push(row.nodeId);
  }
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return openDatabaseConnection().driver
    .queryAll<AssistantThreadIndexRow>(
      `SELECT * FROM assistant_thread_index ${where}
       ORDER BY updated_at DESC, provider_thread_id ASC
       LIMIT ?`,
      [...params, limit]
    )
    .map(rowToRecord);
}

export function archiveAssistantThreadIndex(providerThreadId: string, now = new Date().toISOString()) {
  return updateAssistantThreadIndexStatus(providerThreadId, 'archived', now);
}

export function deleteAssistantThreadIndex(providerThreadId: string, now = new Date().toISOString()) {
  return updateAssistantThreadIndexStatus(providerThreadId, 'deleted', now);
}

function updateAssistantThreadIndexStatus(
  providerThreadId: string,
  status: NativeAssistantThreadIndexStatus,
  now: string
) {
  const provider = DEFAULT_PROVIDER;
  openDatabaseConnection().driver.execute(
    `UPDATE assistant_thread_index
     SET status = ?, updated_at = ?, archived_at = ?, deleted_at = ?
     WHERE provider = ? AND provider_thread_id = ?`,
    [status, now, status === 'archived' ? now : null, status === 'deleted' ? now : null, provider, normalizeRequiredString(providerThreadId, 'providerThreadId')]
  );
  return readAssistantThreadIndexRecord(provider, providerThreadId);
}

function readAssistantThreadIndexRecord(provider: NativeAssistantProviderId, providerThreadId: string) {
  const row = openDatabaseConnection().driver.queryOne<AssistantThreadIndexRow>(
    'SELECT * FROM assistant_thread_index WHERE provider = ? AND provider_thread_id = ?',
    [provider, providerThreadId]
  );
  if (!row) throw new Error('assistant_thread_index_not_found');
  return rowToRecord(row);
}

function normalizeOpeningLocation(location: NativeAssistantThreadOpeningLocation): NativeAssistantThreadOpeningLocation {
  if (location?.type === 'workspace') return { type: 'workspace' };
  if (location?.type === 'node') return { nodeId: normalizeRequiredString(location.nodeId, 'nodeId'), type: 'node' };
  throw new Error('invalid_assistant_thread_location');
}

function locationToColumns(location: NativeAssistantThreadOpeningLocation) {
  return location.type === 'node'
    ? { nodeId: location.nodeId, type: location.type }
    : { nodeId: null, type: location.type };
}

function rowToRecord(row: AssistantThreadIndexRow): NativeAssistantThreadIndexRecord {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    lastOpenedAt: row.last_opened_at,
    location: row.location_type === 'node'
      ? { nodeId: row.location_node_id ?? '', type: 'node' }
      : { type: 'workspace' },
    preview: row.preview,
    provider: row.provider,
    providerThreadId: row.provider_thread_id,
    readError: row.read_error,
    readState: row.read_state,
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at
  };
}

function normalizeRequiredString(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid_${field}`);
  return normalized;
}

function truncateDisplayText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= limit ? normalized : normalized.slice(0, limit - 3).trimEnd() + '...';
}
