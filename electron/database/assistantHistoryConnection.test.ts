// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: mockedAppDataDir })
}));

import {
  closeAssistantHistoryConnection,
  openAssistantHistoryConnection,
  resolveAssistantHistoryDatabasePath
} from './assistantHistoryConnection.js';
import { listAssistantThreadIndex, upsertAssistantThreadIndex } from './assistantThreadIndex.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-history-db-'));
  mockedAppDataDir = path.join(tempRoot, 'user-data');
});

afterEach(async () => {
  closeAssistantHistoryConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('bootstraps a versioned device-local history database and reopens it', () => {
  const connection = openAssistantHistoryConnection();
  expect(connection.dbPath).toBe(path.join(mockedAppDataDir, 'Aide', 'history.db'));
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(2);
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Device-local prompt',
    provider: 'codex-app-server',
    providerThreadId: 'thread-local'
  });

  closeAssistantHistoryConnection();

  expect(resolveAssistantHistoryDatabasePath()).toBe(connection.dbPath);
  expect(listAssistantThreadIndex()).toEqual([
    expect.objectContaining({ providerThreadId: 'thread-local' })
  ]);
});

it('upgrades v1 text history without changing its messages', () => {
  const connection = openAssistantHistoryConnection();
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Keep this text history',
    provider: 'codex-app-server',
    providerThreadId: 'thread-v1'
  });
  connection.sqlite.exec('DROP TABLE assistant_thread_message_images');
  connection.sqlite.exec('DROP TABLE assistant_image_attachments');
  connection.sqlite.pragma('user_version = 1');
  closeAssistantHistoryConnection();

  const upgraded = openAssistantHistoryConnection();
  expect(upgraded.sqlite.pragma('user_version', { simple: true })).toBe(2);
  expect(listAssistantThreadIndex()).toEqual([
    expect.objectContaining({ providerThreadId: 'thread-v1', title: 'Keep this text history' })
  ]);
  expect(upgraded.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'assistant_thread_message_images'"
  ).get()).toEqual({ name: 'assistant_thread_message_images' });
});

it('rejects an unsupported history schema instead of silently rebuilding it', () => {
  const connection = openAssistantHistoryConnection();
  connection.sqlite.pragma('user_version = 99');
  closeAssistantHistoryConnection();

  expect(() => openAssistantHistoryConnection()).toThrow('unsupported_assistant_history_schema_99');
});
