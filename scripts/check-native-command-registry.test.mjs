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
    'assistantCommands.ts', 'companionPairingCommands.ts', 'importCommands.ts', 'reviewCommands.ts',
    'storageAttachmentCommands.ts', 'storageCommandSupport.ts', 'storageExternalSearchCommands.ts',
    'storageLocalFileCommands.ts', 'storageNodeMutationCommands.ts', 'storageReadCommands.ts',
    'storageSettingsCommands.ts', 'storageSyncCommands.ts', 'windowCommands.ts'
  ]) await write(repoRoot, `electron/ipc/${file}`);
  await write(repoRoot, '.lab/specs/shared/platform/native-command-contract-map.md', overrides.inventory ?? `
    | Command | Notes |
    | --- | --- |
    | \`load_thing\` | covered |
    | \`apply_thing\` | covered |
  `);
  return repoRoot;
}

afterAll(async () => Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))));

describe('native command registry contract checks', () => {
  it('reports duplicate registry entries and stale inventory commands', async () => {
    const repoRoot = await createFixture({
      registry: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        export const NATIVE_COMMAND_REGISTRY = [
          { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' },
          { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' },
          { command: NATIVE_COMMANDS.applyThing, route: 'storage', capability: 'dataMutation' }
        ];
      `,
      inventory: `| Command | Notes |\n| --- | --- |\n| \`load_thing\` | covered |\n| \`apply_thing\` | covered |\n| \`removed_thing\` | stale |`
    });
    expect(inspectNativeCommandContracts({ repoRoot }).violations).toEqual([
      'duplicate native command registry entry: loadThing',
      'stale inventory entry: removed_thing'
    ]);
  });

  it('reports missing capability and false handler gaps', async () => {
    const repoRoot = await createFixture({
      registry: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        export const NATIVE_COMMAND_REGISTRY = [
          { command: NATIVE_COMMANDS.loadThing, route: 'storage' },
          { command: NATIVE_COMMANDS.applyThing, route: 'storage', capability: 'dataMutation' }
        ];
      `,
      inventory: `| Command | Notes |\n| --- | --- |\n| \`load_thing\` | covered |\n| \`apply_thing\` | missing-handler: \`apply_thing\` |`
    });
    expect(inspectNativeCommandContracts({ repoRoot }).violations).toEqual([
      'missing native command registry capability: loadThing',
      'handler exists but inventory declares missing-handler: applyThing (apply_thing)'
    ]);
  });
});
