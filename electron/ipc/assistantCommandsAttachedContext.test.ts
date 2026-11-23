// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-attached-context-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return false;
    },
    getPath: () => mockedAppDataDir,
    getAppPath: () => '/tmp/foliole-app-root',
    getVersion: () => '0.6.5-test'
  }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../assistant/codexAppServerAdapter.js', () => ({
  CodexAppServerAdapter: vi.fn(function CodexAppServerAdapter() {
    return {
      dispose: vi.fn(),
      getStatus: vi.fn(),
      sendMessage: adapterSendMessage
    };
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeAssistantHistoryConnection } from '../database/assistantHistoryConnection.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import {
  handleAssistantCommand,
  resetAssistantCommandAdapterForTests
} from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-attached-context-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeAssistantHistoryConnection();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

const ARTICLE = 'Giving the model context helps.\n\nMore context is not always better. Noise hides what matters.\n\nYou decide what to share.';

function seedArticle() {
  const { sqlite } = openDatabaseConnection();
  sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('folder', 'folder', 'Articles', '', 'now', 'now')`).run();
  sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('article', 'folder', 'topic', 'Why context matters', ?, 'now', 'now')`).run(ARTICLE);
}

function send(providerThreadId?: string) {
  return handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'What is the point?',
    openingLocation: { nodeId: 'article', type: 'node' },
    provider: 'codex-app-server',
    ...(providerThreadId ? { providerThreadId } : {}),
    workspaceContext: {
      activeKind: 'topic',
      activeNodeId: 'article',
      activeTitle: 'Why context matters',
      conversationMaterials: [{ nodeId: 'article', title: 'Why context matters' }],
      schemaVersion: 1,
      scope: 'node',
      selection: { charCount: 34, ranges: [{ from: 34, to: 68 }], text: 'More context is not always better.', truncated: false }
    }
  });
}

function mockAnswer() {
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-1', turnId: `turn-${adapterSendMessage.mock.calls.length}` },
    provider: 'codex-app-server',
    state: 'ready'
  });
}

it('attaches a linked material once and not on later turns of the same thread', async () => {
  seedArticle();
  mockAnswer();
  await send();
  const first = adapterSendMessage.mock.calls[0]?.[0];
  expect(first.attachedContext).toContain('Attached Foliole context for "Why context matters" (id=article).');
  expect(first.attachedContext).toContain('[Selected content]\nMore context is not always better.');
  expect(first.attachedContext).toContain('Folder: Articles');
  expect(first.workspaceContext).not.toHaveProperty('selection');

  mockAnswer();
  await send('thread-1');
  expect(adapterSendMessage.mock.calls[1]?.[0]).not.toHaveProperty('attachedContext');
});

it('leaves out items turned off in Aide settings', async () => {
  seedArticle();
  const settings = await handleAssistantCommand(NATIVE_COMMANDS.assistantLoadAttachedContextSettings, {}) as {
    items: Array<{ enabled: boolean; key: string; limit: number }>;
    totalBudget: number;
  };
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSaveAttachedContextSettings, {
    settings: { ...settings, items: settings.items.map(item => item.key === 'location' ? { ...item, enabled: false } : item) }
  });
  mockAnswer();
  await send();
  const input = adapterSendMessage.mock.calls[0]?.[0];
  expect(input.attachedContext).toContain('[Selected content]');
  expect(input.attachedContext).not.toContain('Folder: Articles');
});
