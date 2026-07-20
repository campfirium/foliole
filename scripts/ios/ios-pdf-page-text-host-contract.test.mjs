// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = (name) => readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');

describe('iOS PDF page text host contract', () => {
  it('lands both existing Web bridge methods in the generated read-only query adapter', async () => {
    const plugin = await appSource('FolioleCompanionSyncPlugin.swift');
    const action = await appSource('FolioleCompanionPdfPageTextPlugin.swift');
    const store = await appSource('FolioleCompanionPdfPageTextStore.swift');
    const contract = await appSource('FolioleCompanionPdfPageTextContractStore.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "loadPdfPageText"');
    expect(plugin).toContain('CAPPluginMethod(name: "searchPdfPageText"');
    expect(action).toContain('@objc func loadPdfPageText(_ call: CAPPluginCall)');
    expect(action).toContain('@objc func searchPdfPageText(_ call: CAPPluginCall)');
    expect(store).toMatch(/database\.rows\(\s*contract\.pagesSQL/u);
    expect(store).toContain('database.rows(contract.searchSQL');
    expect(contract).toContain('companion-query-definitions');
  });
});
