// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS reading write host contract', () => {
  it('registers the existing bridge method through a reading-specific adapter', async () => {
    const plugin = await source('FolioleCompanionSyncPlugin.swift');
    const adapter = await source('FolioleCompanionSyncPlugin+ReadingWrite.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "saveSyncNodeReadingRecord"');
    expect(adapter).toContain('@objc func saveSyncNodeReadingRecord');
    expect(adapter).toContain('FolioleCompanionReadingWriteStore');
    expect(adapter).toContain('FolioleCompanionDatabaseLocation.mainDatabase()');
    expect(adapter).toContain('guard let nodeId = call.getString(nodeIdKey)');
    expect(adapter).toContain('guard let readingJson = call.getString(inputKey)');
    expect(adapter).not.toContain('?? "{}"');
  });

  it('keeps SQL and learning keys in generated contracts', async () => {
    const adapter = await source('FolioleCompanionSyncPlugin+ReadingWrite.swift');
    const store = await source('FolioleCompanionReadingWriteStore.swift');
    const query = await json('ios/App/App/companion-query-definitions.json');

    expect(adapter).not.toContain('INSERT ');
    expect(store).not.toContain('INSERT OR REPLACE INTO node_reading');
    expect(query.queries.syncPayloadNodeReading.syncPayload.objectType).toBe('node_reading');
    expect(query.queries.syncPayloadNodeReading.syncPayload.hashIgnoredPayloadKeys)
      .toEqual(['device_id', 'reading_position']);
  });

  it('includes all reading writer sources in SwiftPM and the Xcode target', async () => {
    const packageFile = await readFile(path.join(ROOT, 'ios/App/Package.swift'), 'utf8');
    const project = await readFile(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

    for (const file of [
      'FolioleCompanionReadingWriteContract.swift',
      'FolioleCompanionReadingWriteStore.swift',
      'FolioleCompanionSyncPlugin+ReadingWrite.swift'
    ]) {
      expect(packageFile).toContain(file);
      expect(project).toContain(`${file} in Sources`);
    }
  });
});

function source(name) {
  return readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));
}
