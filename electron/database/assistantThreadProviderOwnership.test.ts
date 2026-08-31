// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-provider-ownership-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { listAssistantThreadIndex, upsertAssistantThreadIndex } from './assistantThreadIndex.js';
import { appendAssistantThreadMessages, listAssistantThreadMessages } from './assistantThreadMessages.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-provider-ownership-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps provider ownership distinct for identical provider thread ids', () => {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' }, message: 'Codex prompt',
    provider: 'codex-app-server', providerThreadId: 'shared-id'
  });
  upsertAssistantThreadIndex({
    location: { type: 'workspace' }, message: 'BYOK prompt',
    provider: 'openai-compatible', providerThreadId: 'shared-id'
  });
  appendAssistantThreadMessages([{
    id: 'byok:user', provider: 'openai-compatible', providerThreadId: 'shared-id',
    role: 'user', text: 'BYOK only'
  }]);

  expect(listAssistantThreadIndex().map((record) => record.provider).sort()).toEqual([
    'codex-app-server', 'openai-compatible'
  ]);
  expect(listAssistantThreadMessages('openai-compatible', 'shared-id'))
    .toEqual([expect.objectContaining({ text: 'BYOK only' })]);
  expect(listAssistantThreadMessages('codex-app-server', 'shared-id')).toEqual([]);
});
