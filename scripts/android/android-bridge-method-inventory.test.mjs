import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ANDROID_COMPANION_SYNC_GROUP_BRIDGE_CONTRACT_DEFINITIONS
} from '../../lib/core/database/androidCompanionSyncGroupBridgeContractDefinitions.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLATFORM_ROOT = path.join(ROOT, 'src/shared/platform');
const JAVA_ROOT = path.join(ROOT, 'android/app/src/main/java/com/foliole/android');
const TYPES_FILES = [
  'companionWorkspaceSyncPluginTypes.ts',
  'companionAttachmentResourceSyncPluginTypes.ts',
  'companionContentBlobSyncPluginTypes.ts',
  'companionPairingSyncPluginTypes.ts',
  'companion/sync/companionSyncGroupAuthorizationPluginTypes.ts'
];

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function extractTypeScriptMethods(source) {
  return [...source.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)].map((match) => match[1]);
}

function extractJavaPluginMethods(source) {
  const pattern = /@PluginMethod(?:\(\))?\s+public void\s+([A-Za-z][A-Za-z0-9_]*)\s*\(/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

async function loadTypeScriptMethods() {
  const sources = await Promise.all(
    TYPES_FILES.map((fileName) => readFile(path.join(PLATFORM_ROOT, fileName), 'utf8'))
  );
  return sources.flatMap(extractTypeScriptMethods);
}

describe('FolioleCompanionSync method inventory', () => {
  it('keeps generated inventory, TypeScript, and Android plugin methods equal', async () => {
    const inventory = ANDROID_COMPANION_SYNC_GROUP_BRIDGE_CONTRACT_DEFINITIONS
      .methodInventory.folioleCompanionSync;
    const javaSource = await readFile(path.join(JAVA_ROOT, 'FolioleCompanionSyncPlugin.java'), 'utf8');
    const typeScriptMethods = await loadTypeScriptMethods();

    expect(inventory).toEqual(sortedUnique(inventory));
    expect(sortedUnique(typeScriptMethods)).toEqual(inventory);
    expect(sortedUnique(extractJavaPluginMethods(javaSource))).toEqual(inventory);
  });

  it('keeps the Web plugin name wired to the registered Android class', async () => {
    const runtimeSource = await readFile(
      path.join(PLATFORM_ROOT, 'companionWorkspaceRuntimeRepository.ts'),
      'utf8'
    );
    const mainActivitySource = await readFile(path.join(JAVA_ROOT, 'MainActivity.java'), 'utf8');

    expect(runtimeSource).toContain("registerPlugin<CompanionWorkspaceSyncPlugin>('FolioleCompanionSync')");
    expect(mainActivitySource).toContain('registerPlugin(FolioleCompanionSyncPlugin.class)');
  });
});
