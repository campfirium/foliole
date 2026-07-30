// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectNativeCommandContracts } from './check-native-command-contracts.mjs';

const TEMP_ROOT_BASE = path.join(process.cwd(), '.tmp', 'tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const repoRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'native-contracts-'));
  tempDirs.push(repoRoot);
  await mkdir(path.join(repoRoot, 'lib/platform'), { recursive: true });
  await mkdir(path.join(repoRoot, 'electron/ipc'), { recursive: true });
  return repoRoot;
}

async function writeFixtureFile(repoRoot, relativePath, contents) {
  await writeFile(path.join(repoRoot, relativePath), contents.trimStart(), 'utf8');
}

async function writeBaseFixture(repoRoot, overrides = {}) {
  await writeFixtureFile(
    repoRoot,
    'lib/platform/nativeCommands.ts',
    overrides.commands ??
      `
      export const NATIVE_COMMANDS = {
        loadThing: 'load_thing',
        applyThing: 'apply_thing'
      } as const;
    `
  );
  await writeFixtureFile(
    repoRoot,
    'lib/platform/nativeContract.ts',
    overrides.contract ??
      `
      import { NATIVE_COMMANDS } from './nativeCommands.js';
      export type NativeCommandMap = {
        [NATIVE_COMMANDS.loadThing]: { args: undefined; result: string };
        [NATIVE_COMMANDS.applyThing]: { args: { id: string }; result: null };
      };
    `
  );
  for (const file of [
    'nativeExternalSearchCommandMap.ts',
    'nativeImportCommandMap.ts',
    'nativeReadwiseCommandMap.ts',
    'nativeRemoteImageCommandMap.ts',
    'nativeSyncCommandMap.ts',
    'nativeTrashCommandMap.ts',
    'nativeUtilityCommandMap.ts'
  ]) {
    await writeFixtureFile(repoRoot, `lib/platform/${file}`, '');
  }
  for (const file of [
    'companionPairingCommands.ts',
    'displayScaleCommands.ts',
    'importCommands.ts',
    'reviewCommands.ts',
    'storageAttachmentCommands.ts',
    'storageCommandSupport.ts',
    'storageReadCommands.ts',
    'storageSyncCommands.ts',
    'windowCommands.ts'
  ]) {
    await writeFixtureFile(repoRoot, `electron/ipc/${file}`, '');
  }
  await writeFixtureFile(
    repoRoot,
    'electron/ipc/storageCommands.ts',
    overrides.handlers ??
      `
      import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
      export function handle(command) {
        if (command === NATIVE_COMMANDS.loadThing) return 'thing';
        if (command === NATIVE_COMMANDS.applyThing) return null;
      }
    `
  );
  await writeFixtureFile(
    repoRoot,
    'electron/ipc/nativeCommandRegistry.ts',
    overrides.registry ??
      `
      import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
      export const NATIVE_COMMAND_REGISTRY = [
        { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' },
        { command: NATIVE_COMMANDS.applyThing, route: 'storage', capability: 'dataMutation' }
      ];
    `
  );
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-native-command-contracts', () => {
  it('passes when command constants, maps, registry and handlers are aligned', async () => {
    const repoRoot = await createFixtureRoot();
    await writeBaseFixture(repoRoot);

    expect(inspectNativeCommandContracts({ repoRoot })).toMatchObject({
      commandCount: 2,
      ok: true,
      violations: []
    });
  });

  it('discovers commands handled in split Electron route modules', async () => {
    const repoRoot = await createFixtureRoot();
    await writeBaseFixture(repoRoot, {
      handlers: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        void NATIVE_COMMANDS.loadThing;
      `
    });
    await writeFixtureFile(repoRoot, 'electron/ipc/assistantLocalHistoryCommands.ts', `
      import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
      void NATIVE_COMMANDS.applyThing;
    `);

    expect(inspectNativeCommandContracts({ repoRoot })).toMatchObject({ ok: true, violations: [] });
  });

  it('discovers Split Topic preference contract and handler modules', async () => {
    const repoRoot = await createFixtureRoot();
    await writeBaseFixture(repoRoot, { contract: '', handlers: '' });
    const references = `
      import { NATIVE_COMMANDS } from './nativeCommands.js';
      void NATIVE_COMMANDS.loadThing;
      void NATIVE_COMMANDS.applyThing;
    `;
    await writeFixtureFile(repoRoot, 'lib/platform/nativeSplitTopicPreferencesContract.ts', references);
    await writeFixtureFile(
      repoRoot,
      'electron/ipc/splitTopicPreferencesCommands.ts',
      references.replace("'./nativeCommands.js'", "'../../lib/platform/nativeCommands.js'")
    );

    expect(inspectNativeCommandContracts({ repoRoot })).toMatchObject({ ok: true, violations: [] });
  });

  it('reports missing contract map, registry and handler coverage', async () => {
    const repoRoot = await createFixtureRoot();
    await writeBaseFixture(repoRoot, {
      contract: `
        import { NATIVE_COMMANDS } from './nativeCommands.js';
        export type NativeCommandMap = {
          [NATIVE_COMMANDS.loadThing]: { args: undefined; result: string };
        };
      `,
      handlers: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        export function handle(command) {
          if (command === NATIVE_COMMANDS.loadThing) return 'thing';
        }
      `,
      registry: `
        import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
        export const NATIVE_COMMAND_REGISTRY = [
          { command: NATIVE_COMMANDS.loadThing, route: 'storage', capability: 'read' }
        ];
      `
    });

    expect(inspectNativeCommandContracts({ repoRoot }).violations).toEqual([
      'missing contract map entry: applyThing',
      'missing native command registry entry: applyThing',
      'missing electron handler: applyThing (apply_thing)'
    ]);
  });

  it('ignores .lab documents entirely', async () => {
    const repoRoot = await createFixtureRoot();
    await writeBaseFixture(repoRoot);
    await mkdir(path.join(repoRoot, '.lab/specs/shared/platform'), { recursive: true });
    await writeFixtureFile(repoRoot, '.lab/specs/shared/platform/native-command-contract-map.md', `
      missing-handler: \`apply_thing\`
      unknown command: \`stale_thing\`
    `);

    expect(inspectNativeCommandContracts({ repoRoot })).toMatchObject({
      commandCount: 2,
      ok: true,
      violations: []
    });
  });
});
