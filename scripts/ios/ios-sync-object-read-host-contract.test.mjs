// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = (name) => readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');

describe('iOS sync object read host contract', () => {
  it('lands index and payload reads in the generated read-only adapter', async () => {
    const plugin = await appSource('FolioleCompanionSyncPlugin.swift');
    const action = await appSource('FolioleCompanionSyncObjectReadPlugin.swift');
    const store = await appSource('FolioleCompanionSyncObjectReadStore.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "loadSyncIndex"');
    expect(plugin).toContain('CAPPluginMethod(name: "loadSyncObjects"');
    expect(action).toContain('@objc func loadSyncIndex(_ call: CAPPluginCall)');
    expect(action).toContain('@objc func loadSyncObjects(_ call: CAPPluginCall)');
    expect(action).toContain('try requiredStringArray(call, "object_ids")');
    expect(action).toContain('try optionalStringArray(call, "object_types")');
    expect(action).not.toContain('compactMap { $0 as? String }');
    expect(store).toContain('contract.syncObjectsQuery.replacing');
    expect(store).toContain('FolioleCompanionGeneratedReadQueryRunner');
  });
});
