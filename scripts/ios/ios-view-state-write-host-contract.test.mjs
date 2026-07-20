// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS view-state write host contract', () => {
  it('registers both existing bridge methods on the iOS sync plugin', async () => {
    const plugin = await appSource('FolioleCompanionSyncPlugin.swift');
    const adapter = await appSource('FolioleCompanionSyncPlugin+ViewStateWrite.swift');

    for (const method of ['saveSyncActiveViewState', 'saveSyncNodeViewState']) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(adapter).toContain(`@objc func ${method}`);
    }
    expect(adapter).toContain('FolioleCompanionDatabaseLocation.mainDatabase()');
    expect(adapter).toContain('FolioleCompanionViewStateWriteStore');
    expect(adapter).toContain('guard let scrollTop = call.getInt(contract.scrollTopPayloadKey)');
    expect(adapter).not.toContain('call.getInt(contract.scrollTopPayloadKey) ?? 0');
  });

  it('keeps the iOS mutation asset generated from the Android shared truth', async () => {
    const ios = await json('ios/App/App/companion-mutation-definitions.json');
    const android = await json('android/app/src/main/assets/companion-mutation-definitions.json');

    expect(ios).toEqual(android);
    expect(ios.syncApplyMutations.viewState).toMatchObject({
      activeNodeUpsertMutationName: 'syncViewActiveNodeUpsert',
      nodeStateUpsertMutationName: 'syncViewNodeStateUpsert'
    });
  });
});

function appSource(name) {
  return readFile(path.join(REPO_ROOT, 'ios/App/App', name), 'utf8');
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}
