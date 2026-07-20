// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = (name) => readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');

describe('iOS external document read host contract', () => {
  it('lands existing load and search methods in the generated read-only query adapter', async () => {
    const plugin = await appSource('FolioleCompanionSyncPlugin.swift');
    const action = await appSource('FolioleCompanionExternalDocumentSearchPlugin.swift');
    const store = await appSource('FolioleCompanionExternalDocumentSearchStore.swift');
    const runner = await appSource('FolioleCompanionGeneratedReadQueryRunner.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "loadExternalDocument"');
    expect(plugin).toContain('CAPPluginMethod(name: "loadExternalDirectory"');
    expect(plugin).toContain('CAPPluginMethod(name: "searchExternalDocuments"');
    expect(action).toContain('@objc func loadExternalDocument(_ call: CAPPluginCall)');
    expect(action).toContain('@objc func loadExternalDirectory(_ call: CAPPluginCall)');
    expect(action).toContain('@objc func searchExternalDocuments(_ call: CAPPluginCall)');
    expect(store).toContain('queries.rows(contract.byIdQuery');
    expect(store).toContain('contract.directoryEntriesQuery');
    expect(store).toMatch(/queries\.rows\(\s*contract\.searchQuery/);
    expect(runner).toContain('fields: [FolioleCompanionGeneratedField]');
    expect(runner).toContain('FolioleReadOnlySQLite(url: databaseURL)');
  });
});
