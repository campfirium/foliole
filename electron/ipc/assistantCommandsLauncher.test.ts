// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
let mockedUserDataPath = '';
let mockedLibraryHome = '';
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

vi.mock('./libraryPathBootstrap.js', () => ({
  resolveBootstrapLibraryPaths: (env: NodeJS.ProcessEnv) => ({
    library_home: env.FOLIOLE_LIBRARY_HOME?.trim() || mockedLibraryHome
  })
}));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import {
  handleAssistantCommand,
  resetAssistantCommandAdapterForTests
} from './assistantCommands.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-launcher-'));
  mockedUserDataPath = path.join(tempRoot, 'user-data');
  mockedLibraryHome = path.join(tempRoot, 'library');
  adapterGetStatus.mockResolvedValue({ provider: 'codex-app-server', state: 'ready' });
  adapterOptions.length = 0;
  delete process.env.FOLIOLE_LIBRARY_HOME;
  delete process.env.CODEX_HOME;
  process.env.USERPROFILE = 'C:\\Users\\Tester';
  resetAssistantCommandAdapterForTests();
});

afterEach(async () => {
  resetAssistantCommandAdapterForTests();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps the adapter cwd in device-local runtime when a library override is available', async () => {
  const libraryHome = path.join(tempRoot, 'override-library');
  process.env.FOLIOLE_LIBRARY_HOME = libraryHome;

  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    developerInstructions: expect.stringContaining('You are Foliole Aide'),
    launcherCwd: path.join(mockedUserDataPath, 'Aide', 'Workspace'),
    skillRoots: [path.join(libraryHome, 'Widgets', 'Foliole Aide', 'Skills')],
    trustConfiguredCommand: false
  });
  await expect(fs.readFile(
    path.join(libraryHome, 'Widgets', 'Foliole Aide', 'AGENTS.md'),
    'utf8'
  )).resolves.toContain('You are Foliole Aide');
});

it('reads managed instructions from the saved current library home', async () => {
  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    developerInstructions: expect.stringContaining('You are Foliole Aide'),
    launcherCwd: path.join(mockedUserDataPath, 'Aide', 'Workspace')
  });
  await expect(fs.readFile(
    path.join(mockedLibraryHome, 'Widgets', 'Foliole Aide', 'AGENTS.md'),
    'utf8'
  )).resolves.toContain('You are Foliole Aide');
});

it('reports a launch failure when the managed Widget definition cannot be created', async () => {
  await fs.mkdir(mockedLibraryHome, { recursive: true });
  await fs.writeFile(path.join(mockedLibraryHome, 'Widgets'), 'not a directory');

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {})).resolves.toMatchObject({
    failure: { category: 'launch_failed' },
    state: 'unavailable'
  });
  expect(adapterOptions).toHaveLength(0);
  await expect(fs.stat(path.join(mockedUserDataPath, 'Widgets'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('uses an isolated Foliole Aide Codex home', async () => {
  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    env: expect.objectContaining({
      CODEX_HOME: path.join(mockedUserDataPath, 'Aide', 'Codex'),
      HOME: path.join(mockedUserDataPath, 'Aide'),
      USERPROFILE: path.join(mockedUserDataPath, 'Aide')
    })
  });
});

it('does not reuse an explicit parent Codex home', async () => {
  process.env.CODEX_HOME = 'D:\\CustomCodexHome';

  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    env: expect.objectContaining({
      CODEX_HOME: path.join(mockedUserDataPath, 'Aide', 'Codex')
    })
  });
});

it('prepends the stable Foliole command for Aide', async () => {
  process.env.PATH = 'C:\\Windows\\System32';

  await handleAssistantCommand(NATIVE_COMMANDS.assistantGetStatus, {});

  expect(adapterOptions[0]).toMatchObject({
    env: expect.objectContaining({
      PATH: expect.stringMatching(/scripts[\\/]agent-control/)
    })
  });
  expect((adapterOptions[0] as { env: NodeJS.ProcessEnv }).env.PATH?.endsWith(
    `${path.delimiter}C:\\Windows\\System32`
  )).toBe(true);
});
