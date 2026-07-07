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
  expect(listAssistantThreadIndex({ location: { nodeId: 'node-1', type: 'node' } })).toEqual([]);
});

it('marks Foliole index archive and delete state without provider mutation', () => {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Workspace prompt',
    now: '2026-07-07T01:00:00.000Z',
    providerThreadId: 'thread-1'
  });

  expect(archiveAssistantThreadIndex('thread-1', '2026-07-07T01:03:00.000Z')).toMatchObject({
    archivedAt: '2026-07-07T01:03:00.000Z',
    status: 'archived'
  });
  expect(listAssistantThreadIndex()).toEqual([]);
  expect(listAssistantThreadIndex({ includeArchived: true })).toHaveLength(1);
  expect(deleteAssistantThreadIndex('thread-1', '2026-07-07T01:04:00.000Z')).toMatchObject({
    deletedAt: '2026-07-07T01:04:00.000Z',
    status: 'deleted'
  });
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