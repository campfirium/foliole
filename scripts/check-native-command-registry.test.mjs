// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectNativeCommandContracts } from './check-native-command-contracts.mjs';

const tempDirs = [];

async function write(repoRoot, relativePath, contents = '') {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents.trimStart(), 'utf8');
}

async function createFixture(overrides = {}) {
  const base = path.join(process.cwd(), '.tmp', 'tests');
  await mkdir(base, { recursive: true });
  const repoRoot = await mkdtemp(path.join(base, 'native-registry-'));
  tempDirs.push(repoRoot);
  await write(repoRoot, 'lib/platform/nativeCommands.ts', `
    export const NATIVE_COMMANDS = {
      loadThing: 'load_thing',
      applyThing: 'apply_thing'
    } as const;
  `);
  await write(repoRoot, 'lib/platform/nativeContract.ts', `
    import { NATIVE_COMMANDS } from './nativeCommands.js';
    export type Map = {
      [NATIVE_COMMANDS.loadThing]: unknown;
      [NATIVE_COMMANDS.applyThing]: unknown;
    };
  `);
  for (const file of [
    'nativeAssistantContract.ts', 'nativeDiscoursePublishContract.ts', 'nativeExternalSearchCommandMap.ts',
    'nativeImportCommandMap.ts', 'nativeLocalFileCommandMap.ts', 'nativeMoveCommandMap.ts',
    'nativeReadwiseCommandMap.ts', 'nativeRemoteImageCommandMap.ts', 'nativeSearchIndexCommandMap.ts',
    'nativeSyncCommandMap.ts', 'nativeTrashCommandMap.ts', 'nativeUtilityCommandMap.ts'
  ]) await write(repoRoot, `lib/platform/${file}`);
  await write(repoRoot, 'electron/ipc/nativeCommandRegistry.ts', overrides.registry ?? `
    import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
    export const NATIVE_COMMAND_REGISTRY = [
      { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' },
      { command: NATIVE_COMMANDS.applyThing, route: 'storage', capability: 'dataMutation' }
    ];
  `);
  await write(repoRoot, 'electron/ipc/storageCommands.ts', `
    import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
    void NATIVE_COMMANDS.loadThing;
    void NATIVE_COMMANDS.applyThing;
  `);
  for (const file of [
    'assistantCommands.ts', 'assistantLocalHistoryCommands.ts', 'companionPairingCommands.ts', 'importCommands.ts', 'reviewCommands.ts',
    'storageAttachmentCommands.ts', 'storageCommandSupport.ts', 'storageExternalSearchCommands.ts',
    'storageLocalFileCommands.ts', 'storageNodeMutationCommands.ts', 'storageReadCommands.ts',
    'storageSettingsCommands.ts', 'storageSyncCommands.ts', 'windowCommands.ts'
  ]) await write(repoRoot, `electron/ipc/${file}`);
  return repoRoot;
}

afterAll(async () => Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))));

describe('native command registry contract checks', () => {
  it('reports duplicate registry entries', async () => {
    const repoRoot = await createFixture({
      registry: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        export const NATIVE_COMMAND_REGISTRY = [
          { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' },
          { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' },
          { command: NATIVE_COMMANDS.applyThing, route: 'storage', capability: 'dataMutation' }
        ];
      `
    });
    expect(inspectNativeCommandContracts({ repoRoot }).violations).toEqual([
      'duplicate native command registry entry: loadThing'
    ]);
  });

  it('reports missing registry capabilities', async () => {
    const repoRoot = await createFixture({
      registry: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        export const NATIVE_COMMAND_REGISTRY = [
          { command: NATIVE_COMMANDS.loadThing, route: 'storage' },
          { command: NATIVE_COMMANDS.applyThing, route: 'storage', capability: 'dataMutation' }
        ];
      `
    });
    expect(inspectNativeCommandContracts({ repoRoot }).violations).toEqual([
      'missing native command registry capability: loadThing'
    ]);
  });
});
