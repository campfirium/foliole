// @vitest-environment node

import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

let mockedUserDataPath = 'C:\\Users\\Tester\\AppData\\Roaming\\foliole';
const adapterGetStatus = vi.hoisted(() => vi.fn());
const adapterOptions = vi.hoisted(() => [] as unknown[]);

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataPath,
    getVersion: () => '0.6.5-test'
  }
}));

vi.mock('../assistant/codexAppServerAdapter.js', () => ({
  CodexAppServerAdapter: vi.fn(function CodexAppServerAdapter(options: unknown) {
    adapterOptions.push(options);
    return {
      dispose: vi.fn(),
      getStatus: adapterGetStatus,
      sendMessage: vi.fn()
    };
  })
}));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import {
  handleAssistantCommand,
  resetAssistantCommandAdapterForTests
} from './assistantCommands.js';

beforeEach(() => {
  adapterGetStatus.mockResolvedValue({ provider: 'codex-app-server', state: 'ready' });
  adapterOptions.length = 0;
  delete process.env.FOLIOLE_LIBRARY_HOME;
  delete process.env.CODEX_HOME;
  process.env.USERPROFILE = 'C:\\Users\\Tester';
  mockedUserDataPath = 'C:\\Users\\Tester\\AppData\\Roaming\\foliole';
  resetAssistantCommandAdapterForTests();
});

it('creates the adapter cwd from the runtime library home when available', async () => {
  const libraryHome = 'D:\\X\\U\\Foliole';
  process.env.FOLIOLE_LIBRARY_HOME = libraryHome;

  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    launcherCwd: path.join(libraryHome, 'Widgets', 'Foliole Aide')
  });
});

it('creates the adapter cwd from userData when no library home is active', async () => {
  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    launcherCwd: path.join(mockedUserDataPath, 'Widgets', 'Foliole Aide')
  });
});

it('uses the signed-in Windows Codex home when the parent environment is unset', async () => {
  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    env: expect.objectContaining({
      CODEX_HOME: path.join('C:\\Users\\Tester', '.codex')
    })
  });
});

it('preserves an explicit Codex home from the parent environment', async () => {
  process.env.CODEX_HOME = 'D:\\CustomCodexHome';

  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    env: expect.objectContaining({
      CODEX_HOME: 'D:\\CustomCodexHome'
    })
  });
});
