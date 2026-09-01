// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-agent-control-tests';
let mockedAppRoot = '/tmp/foliole-app-root';
let mockedIsPackaged = false;
const adapterConstructorArgs = vi.hoisted(() => [] as unknown[]);
const adapterGetStatus = vi.hoisted(() => vi.fn());
const adapterSendMessage = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockedIsPackaged;
    },
    getPath: () => mockedAppDataDir,
    getAppPath: () => mockedAppRoot,
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
  CodexAppServerAdapter: vi.fn(function CodexAppServerAdapter(options: unknown) {
    adapterConstructorArgs.push(options);
    return {
      dispose: vi.fn(),
      getStatus: adapterGetStatus,
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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-agent-control-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedAppRoot = path.join(tempRoot, 'app-root');
  mockedIsPackaged = false;
  adapterConstructorArgs.length = 0;
  adapterGetStatus.mockReset();
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('sets the Agent Control descriptor path in the assistant launcher environment', async () => {
  adapterGetStatus.mockResolvedValue({
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'threadIndex' }
    ],
    provider: 'codex-app-server',
    state: 'ready'
  });

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {})).resolves.toMatchObject({
    agentControl: {
      capabilities: expect.arrayContaining(['materials.create', 'materials.update', 'materials.restore']),
      state: 'running'
    },
    capabilities: expect.arrayContaining([
      { enabled: true, name: 'agentControl' },
      { enabled: true, name: 'sendMessage' }
    ]),
    state: 'ready'
  });

  expect(adapterConstructorArgs[0]).toMatchObject({
    env: expect.objectContaining({
      FOLIOLE_AGENT_DESCRIPTOR: path.join(mockedAppDataDir, 'cache', 'agent-control-session.json')
    })
  });
  expect(readAdapterEnv().PATH).toContain(path.join(
    mockedAppRoot,
    'scripts',
    'agent-control'
  ));
  expect(readAdapterAppServerArgs()).toEqual([]);
});

it('resolves the stable Foliole command from packaged resources', async () => {
  const originalResourcesPath = process.resourcesPath;
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: path.join(tempRoot, 'packaged-resources')
  });
  mockedIsPackaged = true;
  adapterGetStatus.mockResolvedValue({
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'threadIndex' }
    ],
    provider: 'codex-app-server',
    state: 'ready'
  });

  try {
    await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

    expect(readAdapterEnv().PATH).toContain(
      path.join(tempRoot, 'packaged-resources', 'scripts', 'agent-control')
    );
  } finally {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: originalResourcesPath
    });
  }
});

it('preserves Codex auth failures while exposing the running Agent Control tools', async () => {
  adapterGetStatus.mockResolvedValue({
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: false, name: 'sendMessage' },
      { enabled: true, name: 'threadIndex' }
    ],
    failure: { category: 'auth_failed' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {})).resolves.toMatchObject({
    agentControl: {
      state: 'running'
    },
    capabilities: expect.arrayContaining([
      { enabled: true, name: 'agentControl' },
      { enabled: false, name: 'sendMessage' }
    ]),
    failure: { category: 'auth_failed' },
    state: 'unavailable'
  });
});

function readAdapterAppServerArgs() {
  const options = adapterConstructorArgs[0] as { appServerArgs?: unknown };
  if (!Array.isArray(options.appServerArgs)) return [];
  return options.appServerArgs.filter((arg): arg is string => typeof arg === 'string');
}

function readAdapterEnv() {
  const options = adapterConstructorArgs[0] as { env?: NodeJS.ProcessEnv };
  return options.env ?? {};
}

it('passes the local Agent Control API descriptor to Codex app-server turns', async () => {
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready'
  });

  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body',
    openingLocation: { type: 'workspace' },
    provider: 'codex-app-server',
    workspaceContext: { schemaVersion: 1, scope: 'workspace' }
  });

  expect(adapterSendMessage).toHaveBeenCalledWith(expect.objectContaining({
    workspaceContext: expect.objectContaining({
      agentControl: expect.objectContaining({
        capabilities: expect.arrayContaining([
          'materials.create', 'materials.move', 'materials.restore', 'virtualFolders.update'
        ]),
        state: 'running'
      }),
      scope: 'workspace'
    })
  }));
});
