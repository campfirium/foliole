import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeAssistantProviderId,
  NativeAssistantThreadMessageRecord
} from '../../lib/platform/nativeAssistantContract.js';

import { openDatabaseConnection } from './connection.js';

const DEFAULT_PROVIDER: NativeAssistantProviderId = 'codex-app-server';

interface AssistantThreadMessageRow extends DatabaseRow {
  created_at: string;
  message_id: string;
  provider: NativeAssistantProviderId;
  provider_thread_id: string;
  role: NativeAssistantThreadMessageRecord['role'];
  text: string;
}

export interface AssistantThreadMessageInput {
  createdAt?: string;
  id: string;
  provider?: NativeAssistantProviderId;
  providerThreadId: string;
  role: NativeAssistantThreadMessageRecord['role'];
  text: string;
}

export function appendAssistantThreadMessages(
  messages: AssistantThreadMessageInput[]
): NativeAssistantThreadMessageRecord[] {
  if (messages.length === 0) return [];
  const provider = messages[0]?.provider ?? DEFAULT_PROVIDER;
  const providerThreadId = normalizeRequiredString(messages[0]?.providerThreadId ?? '', 'providerThreadId');
  const now = Date.now();
  const normalized = messages.map((message, index) => ({
    createdAt: message.createdAt ?? new Date(now + index).toISOString(),
    id: normalizeRequiredString(message.id, 'messageId'),
    provider: message.provider ?? DEFAULT_PROVIDER,
    providerThreadId: normalizeRequiredString(message.providerThreadId, 'providerThreadId'),
    role: normalizeAssistantMessageRole(message.role),
    text: message.text
  }));
  assertSameThreadBatch(normalized, provider, providerThreadId);
  openDatabaseConnection().driver.transaction((driver) => {
    for (const message of normalized) {
      driver.execute(
        `INSERT OR REPLACE INTO assistant_thread_messages (
          provider, provider_thread_id, message_id, role, text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [message.provider, message.providerThreadId, message.id, message.role, message.text, message.createdAt]
      );
    }
  });
  return listAssistantThreadMessages(providerThreadId, provider);
}

function assertSameThreadBatch(
  messages: Pick<AssistantThreadMessageInput, 'provider' | 'providerThreadId'>[],
  provider: NativeAssistantProviderId,
  providerThreadId: string
) {
  if (messages.every((message) =>
    message.provider === provider && message.providerThreadId === providerThreadId
  )) return;
  throw new Error('mixed_assistant_thread_messages');
}

export function listAssistantThreadMessages(
  providerThreadId: string,
  provider: NativeAssistantProviderId = DEFAULT_PROVIDER
): NativeAssistantThreadMessageRecord[] {
  const normalizedThreadId = normalizeRequiredString(providerThreadId, 'providerThreadId');
  return openDatabaseConnection()
    .driver.queryAll<AssistantThreadMessageRow>(
      `SELECT * FROM assistant_thread_messages
       WHERE provider = ? AND provider_thread_id = ?
       ORDER BY created_at ASC, message_id ASC`,
      [provider, normalizedThreadId]
    )
    .map(messageRowToRecord);
}

export function deleteAssistantThreadMessages(
  providerThreadId: string,
  provider: NativeAssistantProviderId = DEFAULT_PROVIDER
) {
  return openDatabaseConnection().driver.execute(
    `DELETE FROM assistant_thread_messages
     WHERE provider = ? AND provider_thread_id = ?`,
    [provider, normalizeRequiredString(providerThreadId, 'providerThreadId')]
  );
}

function messageRowToRecord(row: AssistantThreadMessageRow): NativeAssistantThreadMessageRecord {
  return {
    createdAt: row.created_at,
    id: row.message_id,
    provider: row.provider,
    providerThreadId: row.provider_thread_id,
    role: row.role,
    text: row.text
  };
}

function normalizeRequiredString(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid_${field}`);
  return normalized;
}

function normalizeAssistantMessageRole(role: NativeAssistantThreadMessageRecord['role']) {
  if (role === 'assistant' || role === 'user') return role;
  throw new Error('invalid_assistant_message_role');
}
