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

  it('keeps query definitions identical except for native setting and view-state platform identity', async () => {
    const fileName = 'companion-query-definitions.json';
    const ios = await readJson(path.join(REPO_ROOT, 'ios/App/App', fileName));
    const android = await readJson(path.join(REPO_ROOT, 'android/app/src/main/assets', fileName));

    expect(ios.queries.syncPayloadSetting.syncPayload.defaultPlatform).toBe('ios');
    expect(android.queries.syncPayloadSetting.syncPayload.defaultPlatform).toBe('android');
    expect(ios.queries.syncPayloadViewActiveNode.syncPayload.platform).toBe('ios');
    expect(android.queries.syncPayloadViewActiveNode.syncPayload.platform).toBe('android');
    ios.queries.syncPayloadSetting.syncPayload.defaultPlatform = 'android';
    ios.queries.syncPayloadViewActiveNode.syncPayload.platform = 'android';
    expect(ios).toEqual(android);
  });

  it('makes the iOS pairing store consume the generated protocol version', async () => {
    const contractStore = await readFile(path.join(REPO_ROOT, 'ios/App/App/FolioleCompanionContractStore.swift'), 'utf8');
    const pairingStore = await readFile(path.join(REPO_ROOT, 'ios/App/App/FolioleCompanionPairingStore.swift'), 'utf8');

    expect(contractStore).toContain('protocolVersion: try integer(path: ["syncProtocol", "version"], root: sync)');
    expect(pairingStore).toContain('negotiatedVersion == contract.protocolVersion');
    expect(pairingStore).toContain('negotiatedProtocolVersion == contract.protocolVersion');
    expect(pairingStore).not.toContain('currentProtocolVersion =');
  });

});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
