// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS } from '../../lib/core/database/androidCompanionBridgeContractDefinitions.ts';
import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS companion contract assets', () => {
  it.each([
    ['companion-bridge-contract-definitions.json', ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS],
    ['companion-sync-protocol-definitions.json', ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS]
  ])('keeps %s generated from the shared contract truth', async (fileName, definitions) => {
    const ios = await readJson(path.join(REPO_ROOT, 'ios/App/App', fileName));
    const android = await readJson(path.join(REPO_ROOT, 'android/app/src/main/assets', fileName));

    expect(ios).toEqual(definitions);
    expect(ios).toEqual(android);
  });

  it('keeps the generated query definitions identical across native hosts', async () => {
    const fileName = 'companion-query-definitions.json';
    expect(await readJson(path.join(REPO_ROOT, 'ios/App/App', fileName))).toEqual(
      await readJson(path.join(REPO_ROOT, 'android/app/src/main/assets', fileName))
    );
  });
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
