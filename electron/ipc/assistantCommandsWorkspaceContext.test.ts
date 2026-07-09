// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-workspace-context-tests';
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
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import {
  handleAssistantCommand,
  resetAssistantCommandAdapterForTests
} from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-workspace-context-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('passes sanitized Foliole workspace context to provider turns', async () => {
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready'
  });

  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body',
    openingLocation: { nodeId: 'active-node', type: 'node' },
    workspaceContext: createWorkspaceContext()
  });

  const sentInput = adapterSendMessage.mock.calls[0]?.[0];
  expect(adapterSendMessage).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Prompt body',
    workspaceContext: expect.objectContaining({
      activeKind: 'folder',
      activeNodeId: 'active-node',
      activeParentNodeId: 'parent-node',
      activeTitle: 'Active folder',
      document: {
        bodyStatus: 'ready',
        charCount: 42,
        preview: 'Active preview',
        truncated: false
      },
      folder: {
        childCount: 2,
        children: [{
          bodyStatus: 'ready',
          hasContent: true,
          kind: 'topic',
          nodeId: 'child-node',
          preview: 'Child preview',
          title: 'Child topic'
        }],
        truncated: true
      },
      scope: 'node',
      selection: {
        charCount: 7,
        ranges: [{ from: 1, to: 8 }],
        text: 'selected',
        truncated: false
      }
    })
  }));
  expect(sentInput.workspaceContext).not.toHaveProperty('unknown');
});

function createWorkspaceContext() {
  return {
    activeKind: 'folder',
    activeNodeId: 'active-node',
    activeParentNodeId: 'parent-node',
    activeTitle: 'Active folder',
    document: {
      bodyStatus: 'ready',
      charCount: 42,
      preview: 'Active preview',
      truncated: false
    },
    folder: {
      childCount: 2,
      children: [{
        bodyStatus: 'ready',
        hasContent: true,
        kind: 'topic',
        nodeId: 'child-node',
        preview: 'Child preview',
        title: 'Child topic'
      }],
      truncated: true
    },
    schemaVersion: 1,
    scope: 'node',
    selection: {
      charCount: 7,
      ranges: [{ from: 1, to: 8 }],
      text: 'selected',
      truncated: false
    },
    unknown: 'drop'
  };
}
