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
      cliPath: path.join(mockedAppRoot, 'scripts', 'agent-control', 'foliole-agent.mjs'),
      endpoint: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
      descriptorPath: path.join(mockedAppDataDir, 'cache', 'agent-control-session.json'),
      state: 'running',
      tracePath: path.join(mockedAppDataDir, 'cache', 'agent-control-mcp-trace.jsonl')
    },
    capabilities: expect.arrayContaining([
      { enabled: true, name: 'agentControl' },
      { enabled: true, name: 'sendMessage' }
    ]),
    state: 'ready'
  });

  expect(adapterConstructorArgs[0]).toMatchObject({
    appServerArgs: expect.arrayContaining([
      'mcp_servers.foliole_agent_control.command="node"'
    ]),
    env: expect.objectContaining({
      FOLIOLE_AGENT_DESCRIPTOR: path.join(mockedAppDataDir, 'cache', 'agent-control-session.json'),
      FOLIOLE_AGENT_MCP_TRACE_PATH: path.join(mockedAppDataDir, 'cache', 'agent-control-mcp-trace.jsonl')
    })
  });
  const appServerArgs = readAdapterAppServerArgs();
  expect(appServerArgs.join(' ')).toContain('foliole-mcp-server.mjs');
  expect(appServerArgs.join(' ')).toContain(tomlStringContent(path.join(
    mockedAppRoot,
    'scripts',
    'agent-control'
  )));
});

it('resolves the Agent Control MCP server from packaged resources', async () => {
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

    expect(readAdapterAppServerArgs().join(' ')).toContain(tomlStringContent(
      path.join(tempRoot, 'packaged-resources', 'scripts', 'agent-control')
    ));
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
      endpoint: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
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

function tomlStringContent(value: string) {
  return value;
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
    workspaceContext: { schemaVersion: 1, scope: 'workspace' }
  });

  expect(adapterSendMessage).toHaveBeenCalledWith(expect.objectContaining({
    workspaceContext: expect.objectContaining({
      agentControl: expect.objectContaining({
        capabilities: expect.not.arrayContaining(['virtualFolders.write']),
        cliPath: path.join(mockedAppRoot, 'scripts', 'agent-control', 'foliole-agent.mjs'),
        descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
        descriptorPath: path.join(mockedAppDataDir, 'cache', 'agent-control-session.json'),
        endpoint: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
        state: 'running',
        tracePath: path.join(mockedAppDataDir, 'cache', 'agent-control-mcp-trace.jsonl')
      }),
      scope: 'workspace'
    })
  }));
});
