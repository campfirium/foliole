// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-thread-index-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import {
  archiveAssistantThreadIndex,
  deleteAssistantThreadIndex,
  listAssistantThreadIndex,
  upsertAssistantThreadIndex
} from './assistantThreadIndex.js';
import {
  appendAssistantThreadMessages,
  listAssistantThreadMessages
} from './assistantThreadMessages.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-thread-index-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('upserts provider threads by opening location without storing message bodies', () => {
  const first = upsertAssistantThreadIndex({
    location: { nodeId: 'node-1', type: 'node' },
    message: '  First   prompt body  ',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });
  upsertAssistantThreadIndex({
    location: { nodeId: 'node-1', type: 'node' },
    message: 'Second prompt',
    now: '2026-07-07T01:01:00.000Z',
    providerThreadId: 'thread-2'
  });

  expect(first).toMatchObject({
    agentToolVersion: 2,
    continuedFromThreadId: null,
    location: { nodeId: 'node-1', type: 'node' },
    preview: 'First prompt body',
    providerThreadId: 'thread-1',
    readError: null,
    readState: 'not_requested',
    status: 'active',
    title: 'First prompt body'
  });
  expect(listAssistantThreadIndex({ location: { nodeId: 'node-1', type: 'node' } }).map((record) => record.providerThreadId))
    .toEqual(['thread-2', 'thread-1']);
});

it('moves an existing provider thread to one opening location', () => {
  upsertAssistantThreadIndex({
    location: { nodeId: 'node-1', type: 'node' },
    message: 'Node prompt',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });

  const updated = upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Workspace prompt',
    now: '2026-07-07T01:02:00.000Z',
    providerThreadId: 'thread-1'
  });

  expect(updated.location).toEqual({ type: 'workspace' });
  expect(updated.title).toBe('Node prompt');
  expect(updated.preview).toBe('Workspace prompt');
  expect(listAssistantThreadIndex({ location: { nodeId: 'node-1', type: 'node' } })).toEqual([]);
});

it('keeps the original thread title while updating the latest preview', () => {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Original question about the folder',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });

  const updated = upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Short follow-up',
    now: '2026-07-07T01:02:00.000Z',
    providerThreadId: 'thread-1'
  });

  expect(updated).toMatchObject({
    lastOpenedAt: '2026-07-07T01:02:00.000Z',
    preview: 'Short follow-up',
    providerThreadId: 'thread-1',
    title: 'Original question about the folder',
    updatedAt: '2026-07-07T01:02:00.000Z'
  });
});

it('marks Foliole index archive and delete state without provider mutation', () => {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Workspace prompt',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });
  appendAssistantThreadMessages([
    { id: 'turn-1:user', providerThreadId: 'thread-1', role: 'user', text: 'Prompt' },
    { id: 'turn-1:assistant', providerThreadId: 'thread-1', role: 'assistant', text: 'Answer' }
  ]);

  expect(archiveAssistantThreadIndex('thread-1', '2026-07-07T01:03:00.000Z')).toMatchObject({
    archivedAt: '2026-07-07T01:03:00.000Z',
    status: 'archived'
  });
  expect(listAssistantThreadMessages('thread-1')).toHaveLength(2);
  expect(listAssistantThreadIndex()).toEqual([]);
  expect(listAssistantThreadIndex({ includeArchived: true })).toHaveLength(1);
  expect(deleteAssistantThreadIndex('thread-1', '2026-07-07T01:04:00.000Z')).toMatchObject({
    deletedAt: '2026-07-07T01:04:00.000Z',
    status: 'deleted'
  });
  expect(listAssistantThreadMessages('thread-1')).toEqual([]);
});

it('stores local assistant thread messages in order', () => {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Workspace prompt',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });

  appendAssistantThreadMessages([
    {
      createdAt: '2026-07-07T01:00:01.000Z',
      id: 'turn-1:user',
      providerThreadId: 'thread-1',
      role: 'user',
      text: 'Workspace prompt'
    },
    {
      createdAt: '2026-07-07T01:00:02.000Z',
      id: 'turn-1:assistant',
      providerThreadId: 'thread-1',
      role: 'assistant',
      text: 'Assistant answer'
    }
  ]);

  expect(listAssistantThreadMessages('thread-1')).toEqual([
    expect.objectContaining({ id: 'turn-1:user', role: 'user', text: 'Workspace prompt' }),
    expect.objectContaining({ id: 'turn-1:assistant', role: 'assistant', text: 'Assistant answer' })
  ]);
});

it('rejects mixed local assistant message batches before writing', () => {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Workspace prompt',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });

  expect(() => appendAssistantThreadMessages([
    { id: 'turn-1:user', providerThreadId: 'thread-1', role: 'user', text: 'Prompt' },
    { id: 'turn-2:user', providerThreadId: 'thread-2', role: 'user', text: 'Other prompt' }
  ])).toThrow(/mixed_assistant_thread_messages/);

  expect(listAssistantThreadMessages('thread-1')).toEqual([]);
});

it('rejects local assistant messages without a thread index', () => {
  expect(() => appendAssistantThreadMessages([
    { id: 'turn-1:user', providerThreadId: 'thread-missing', role: 'user', text: 'Prompt' }
  ])).toThrow(/FOREIGN KEY constraint failed/);

  expect(listAssistantThreadMessages('thread-missing')).toEqual([]);
});

it('rejects unstable opening locations and truncates display text deterministically', () => {
  expect(() => upsertAssistantThreadIndex({
    location: { nodeId: ' ', type: 'node' },
    message: 'Prompt',
    providerThreadId: 'thread-1'
  })).toThrow(/invalid_nodeId/);

  const record = upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'x'.repeat(200),
    providerThreadId: 'thread-2'
  });
  expect(record.title).toHaveLength(80);
  expect(record.title.endsWith('...')).toBe(true);
  expect(record.preview.endsWith('...')).toBe(true);
});
