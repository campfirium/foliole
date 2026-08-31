import type { DatabaseBindValue, DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeAssistantProviderId,
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadIndexStatus,
  NativeAssistantThreadOpeningLocation,
  NativeAssistantThreadReadState
} from '../../lib/platform/nativeAssistantContract.js';
import { CURRENT_ASSISTANT_AGENT_TOOL_VERSION } from '../../lib/platform/nativeAssistantContract.js';

import { openAssistantHistoryConnection } from './assistantHistoryConnection.js';
import {
  deleteUnreferencedAssistantImageAttachments,
  listAssistantThreadAttachmentIds
} from './assistantThreadImages.js';
import { deleteAssistantThreadMessages } from './assistantThreadMessages.js';
import { truncateAssistantThreadDisplayText } from './assistantThreadText.js';

const TITLE_LIMIT = 80;
const PREVIEW_LIMIT = 160;

interface AssistantThreadIndexRow extends DatabaseRow {
  agent_tool_version: number;
  archived_at: string | null;
  continued_from_thread_id: string | null;
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
  agentToolVersion?: number;
  continuedFromThreadId?: string;
  location: NativeAssistantThreadOpeningLocation;
  message: string;
  provider: NativeAssistantProviderId;
  providerThreadId: string;
  now?: string;
}

export interface AssistantThreadIndexListInput {
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  location?: NativeAssistantThreadOpeningLocation;
}

export function upsertAssistantThreadIndex(
  input: AssistantThreadIndexUpsertInput
): NativeAssistantThreadIndexRecord {
  const location = normalizeOpeningLocation(input.location);
  const providerThreadId = normalizeRequiredString(input.providerThreadId, 'providerThreadId');
  const now = input.now ?? new Date().toISOString();
  const title = truncateAssistantThreadDisplayText(input.message, TITLE_LIMIT) || 'Untitled thread';
  const preview = truncateAssistantThreadDisplayText(input.message, PREVIEW_LIMIT);
  const provider = input.provider;
  const row = locationToColumns(location);

  openAssistantHistoryConnection().driver.execute(
    `INSERT INTO assistant_thread_index (
       provider, provider_thread_id, agent_tool_version, continued_from_thread_id,
       location_type, location_node_id, title, preview,
       status, read_state, read_error, created_at, updated_at, last_opened_at,
       archived_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'not_requested', NULL, ?, ?, ?, NULL, NULL)
     ON CONFLICT(provider, provider_thread_id) DO UPDATE SET
       location_type = excluded.location_type,
       location_node_id = excluded.location_node_id,
       agent_tool_version = excluded.agent_tool_version,
       preview = excluded.preview,
       status = 'active',
       updated_at = excluded.updated_at,
       last_opened_at = excluded.last_opened_at,
       archived_at = NULL,
       deleted_at = NULL`,
    [
      provider, providerThreadId, input.agentToolVersion ?? CURRENT_ASSISTANT_AGENT_TOOL_VERSION,
      input.continuedFromThreadId ?? null,
      row.type, row.nodeId, title, preview, now, now, now
    ]
  );

  return readAssistantThreadIndexRecord(provider, providerThreadId);
}

export function listAssistantThreadIndex(
  input: AssistantThreadIndexListInput = {}
): NativeAssistantThreadIndexRecord[] {
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
  return openAssistantHistoryConnection()
    .driver.queryAll<AssistantThreadIndexRow>(
      `SELECT * FROM assistant_thread_index ${where}
       ORDER BY updated_at DESC, provider_thread_id ASC
       LIMIT ?`,
      [...params, limit]
    )
    .map(rowToRecord);
}

export function getAssistantThreadIndex(
  provider: NativeAssistantProviderId,
  providerThreadId: string
) {
  return readAssistantThreadIndexRecord(
    provider,
    normalizeRequiredString(providerThreadId, 'providerThreadId')
  );
}

export function archiveAssistantThreadIndex(
  provider: NativeAssistantProviderId,
  providerThreadId: string,
  now = new Date().toISOString()
) {
  return updateAssistantThreadIndexStatus(provider, providerThreadId, 'archived', now);
}

export function deleteAssistantThreadIndex(
  provider: NativeAssistantProviderId,
  providerThreadId: string,
  now = new Date().toISOString()
) {
  return deleteAssistantThreadIndexWithImages(provider, providerThreadId, now).record;
}

export function deleteAssistantThreadIndexWithImages(
  provider: NativeAssistantProviderId,
  providerThreadId: string,
  now = new Date().toISOString()
) {
  return openAssistantHistoryConnection().driver.transaction(() => {
    const attachmentIds = listAssistantThreadAttachmentIds(provider, providerThreadId);
    const record = updateAssistantThreadIndexStatus(provider, providerThreadId, 'deleted', now);
    deleteAssistantThreadMessages(provider, providerThreadId);
    const unreferencedImages = deleteUnreferencedAssistantImageAttachments(attachmentIds);
    return { record, unreferencedImages };
  });
}

function updateAssistantThreadIndexStatus(
  provider: NativeAssistantProviderId,
  providerThreadId: string,
  status: NativeAssistantThreadIndexStatus,
  now: string
) {
  openAssistantHistoryConnection().driver.execute(
    `UPDATE assistant_thread_index
     SET status = ?, updated_at = ?, archived_at = ?, deleted_at = ?
     WHERE provider = ? AND provider_thread_id = ?`,
    [
      status,
      now,
      status === 'archived' ? now : null,
      status === 'deleted' ? now : null,
      provider,
      normalizeRequiredString(providerThreadId, 'providerThreadId')
    ]
  );
  return readAssistantThreadIndexRecord(provider, providerThreadId);
}

function readAssistantThreadIndexRecord(
  provider: NativeAssistantProviderId,
  providerThreadId: string
) {
  const row = openAssistantHistoryConnection().driver.queryOne<AssistantThreadIndexRow>(
    'SELECT * FROM assistant_thread_index WHERE provider = ? AND provider_thread_id = ?',
    [provider, providerThreadId]
  );
  if (!row) throw new Error('assistant_thread_index_not_found');
  return rowToRecord(row);
}

function normalizeOpeningLocation(
  location: NativeAssistantThreadOpeningLocation
): NativeAssistantThreadOpeningLocation {
  if (location?.type === 'workspace') return { type: 'workspace' };
  if (location?.type === 'node')
    return { nodeId: normalizeRequiredString(location.nodeId, 'nodeId'), type: 'node' };
  throw new Error('invalid_assistant_thread_location');
}

function locationToColumns(location: NativeAssistantThreadOpeningLocation) {
  return location.type === 'node'
    ? { nodeId: location.nodeId, type: location.type }
    : { nodeId: null, type: location.type };
}

function rowToRecord(row: AssistantThreadIndexRow): NativeAssistantThreadIndexRecord {
  return {
    agentToolVersion: row.agent_tool_version,
    archivedAt: row.archived_at,
    continuedFromThreadId: row.continued_from_thread_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    lastOpenedAt: row.last_opened_at,
    location:
      row.location_type === 'node'
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
