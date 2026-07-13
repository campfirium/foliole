// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  findCodexCommandCandidates,
  findMacosCodexCommands,
  findWindowsDesktopCodexCommands
} from './codexAppServerCommandDiscovery.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('finds newest validated-shape Desktop runtimes without using mutable helper locations', async () => {
  const localAppData = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-codex-discovery-'));
  temporaryRoots.push(localAppData);
  const binRoot = path.join(localAppData, 'OpenAI', 'Codex', 'bin');
  const older = await createCandidate(binRoot, '1111111111111111', 1_000);
  const newer = await createCandidate(binRoot, 'aaaaaaaaaaaaaaaa', 2_000);
  await createCandidate(binRoot, '.sandbox-bin', 3_000);
  await fs.writeFile(path.join(binRoot, 'codex.exe'), 'legacy');

  await expect(findWindowsDesktopCodexCommands({ LOCALAPPDATA: localAppData })).resolves.toEqual([
    newer,
    older
  ]);
});

it('returns no Desktop candidates when LOCALAPPDATA or the bin directory is missing', async () => {
  await expect(findWindowsDesktopCodexCommands({})).resolves.toEqual([]);
  await expect(findWindowsDesktopCodexCommands({ LOCALAPPDATA: 'Z:\\missing' })).resolves.toEqual([]);
});

it('uses explicit configuration before controlled macOS candidates without a login shell', async () => {
  const env = {
    FOLIOLE_CODEX_COMMAND: '/Applications/Custom Codex/codex',
    HOME: '/Users/tester',
    PATH: '/usr/bin:/bin'
  };

  await expect(findCodexCommandCandidates(env, 'darwin')).resolves.toEqual([
    '/Applications/Custom Codex/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Users/tester/.local/bin/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex'
  ]);
});

it('keeps the macOS candidate set bounded when HOME is unavailable', () => {
  expect(findMacosCodexCommands({})).toEqual([
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex'
  ]);
});

async function createCandidate(binRoot: string, directory: string, modifiedAt: number) {
  const command = path.join(binRoot, directory, 'codex.exe');
  await fs.mkdir(path.dirname(command), { recursive: true });
  await fs.writeFile(command, directory);
  const timestamp = new Date(modifiedAt);
  await fs.utimes(command, timestamp, timestamp);
  return command;
}
