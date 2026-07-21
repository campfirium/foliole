// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COMPANION_TOPIC_SEARCH_HOST_CONTRACT } from '../../lib/core/database/companionTopicSearchDefinitions.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = (name) => readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');

describe('iOS topic search host contract', () => {
  it('keeps the generated query and payload keys in the bundled bridge contract', async () => {
    const bundled = JSON.parse(await readFile(
      path.join(ROOT, 'ios/App/App/companion-bridge-contract-definitions.json'),
      'utf8'
    ));

    expect(bundled.hostApi.topicSearch).toEqual(COMPANION_TOPIC_SEARCH_HOST_CONTRACT);
  });

  it('lands the existing Web bridge method in the iOS read-only SQLite adapter', async () => {
    const plugin = await appSource('FolioleCompanionSyncPlugin.swift');
    const action = await appSource('FolioleCompanionTopicSearchPlugin.swift');
    const store = await appSource('FolioleCompanionTopicSearchStore.swift');
    const database = await appSource('FolioleReadOnlySQLite.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "searchTopics"');
    expect(action).toContain('@objc func searchTopics(_ call: CAPPluginCall)');
    expect(action).toContain('FolioleCompanionTopicSearchContractStore().contract()');
    expect(action).toContain('store.search(query: query, limit: call.getInt(limitKey))');
    expect(store).toContain('FolioleCompanionGeneratedReadQueryRunner');
    expect(store).toContain('definitions.query(named: definitions.string("searchQueryName", in: rules))');
    expect(store).toContain('fields: contract.searchResultFields');
    expect(store).not.toContain('Int(row[5] ?? "") ?? 0');
    expect(database).toContain('SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX');
  });
});
