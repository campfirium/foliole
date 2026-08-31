import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeAssistantProviderId,
  NativeAssistantThreadMessageRecord
} from '../../lib/platform/nativeAssistantContract.js';
import type {
  NativeAssistantImageAttachment
} from '../../lib/platform/nativeAssistantImageContract.js';

import { openAssistantHistoryConnection } from './assistantHistoryConnection.js';
import {
  listAssistantThreadMessageImages,
  replaceAssistantMessageImages
} from './assistantThreadImages.js';

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
  images?: NativeAssistantImageAttachment[];
  provider: NativeAssistantProviderId;
  providerThreadId: string;
  role: NativeAssistantThreadMessageRecord['role'];
  text: string;
}

export function appendAssistantThreadMessages(
  messages: AssistantThreadMessageInput[]
): NativeAssistantThreadMessageRecord[] {
  if (messages.length === 0) return [];
  const provider = messages[0]?.provider;
  if (!provider) throw new Error('invalid_assistant_provider');
  const providerThreadId = normalizeRequiredString(messages[0]?.providerThreadId ?? '', 'providerThreadId');
  const now = Date.now();
  const normalized = messages.map((message, index) => ({
    createdAt: message.createdAt ?? new Date(now + index).toISOString(),
    id: normalizeRequiredString(message.id, 'messageId'),
    images: message.images ?? [],
    provider: message.provider,
    providerThreadId: normalizeRequiredString(message.providerThreadId, 'providerThreadId'),
    role: normalizeAssistantMessageRole(message.role),
    text: message.text
  }));
  assertSameThreadBatch(normalized, provider, providerThreadId);
  openAssistantHistoryConnection().driver.transaction((driver) => {
    for (const message of normalized) {
      driver.execute(
        `INSERT OR REPLACE INTO assistant_thread_messages (
          provider, provider_thread_id, message_id, role, text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [message.provider, message.providerThreadId, message.id, message.role, message.text, message.createdAt]
      );
      replaceAssistantMessageImages({
        images: message.images ?? [],
        messageId: message.id,
        provider: message.provider,
        providerThreadId: message.providerThreadId
      });
    }
  });
  return listAssistantThreadMessages(provider, providerThreadId);
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
  provider: NativeAssistantProviderId,
  providerThreadId: string
): NativeAssistantThreadMessageRecord[] {
  const normalizedThreadId = normalizeRequiredString(providerThreadId, 'providerThreadId');
  const messages = openAssistantHistoryConnection()
    .driver.queryAll<AssistantThreadMessageRow>(
      `SELECT * FROM assistant_thread_messages
       WHERE provider = ? AND provider_thread_id = ?
       ORDER BY created_at ASC, message_id ASC`,
      [provider, normalizedThreadId]
    )
    .map(messageRowToRecord);
  const imagesByMessage = listAssistantThreadMessageImages(provider, normalizedThreadId);
  return messages.map((message) => {
    const images = imagesByMessage.get(message.id);
    return images?.length ? { ...message, images } : message;
  });
}

export function deleteAssistantThreadMessages(
  provider: NativeAssistantProviderId,
  providerThreadId: string
) {
  return openAssistantHistoryConnection().driver.execute(
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
