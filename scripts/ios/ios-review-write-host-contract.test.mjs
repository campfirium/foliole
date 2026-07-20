// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS review write host contract', () => {
  it('registers the existing bridge method through a review-specific adapter', async () => {
    const plugin = await source('FolioleCompanionSyncPlugin.swift');
    const adapter = await source('FolioleCompanionSyncPlugin+ReviewWrite.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "saveSyncNodeReviewRecord"');
    expect(adapter).toContain('@objc func saveSyncNodeReviewRecord');
    expect(adapter).toContain('FolioleCompanionReviewWriteStore');
    expect(adapter).toContain('FolioleCompanionDatabaseLocation.mainDatabase()');
    expect(adapter).toContain('guard let nodeId = call.getString(nodeIdKey)');
    expect(adapter).toContain('guard let reviewJson = call.getString(inputKey)');
    expect(adapter).not.toContain('?? "{}"');
  });

  it('keeps SQL and review-log keys in generated contracts', async () => {
    const adapter = await source('FolioleCompanionSyncPlugin+ReviewWrite.swift');
    const store = await source('FolioleCompanionReviewWriteStore.swift');
    const query = await json('ios/App/App/companion-query-definitions.json');

    expect(adapter).not.toContain('INSERT ');
    expect(store).not.toContain('INSERT OR REPLACE INTO node_review');
    expect(query.queries.syncPayloadNodeReview.syncPayload.objectType).toBe('node_review');
    expect(query.queries.syncReviewLog.columns.map((column) => column.key))
      .toContain('op_id');
  });

  it('includes learning and review writer sources in SwiftPM and the Xcode target', async () => {
    const packageFile = await readFile(path.join(ROOT, 'ios/App/Package.swift'), 'utf8');
    const project = await readFile(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

    for (const file of [
      'FolioleCompanionLearningWriteDatabase.swift',
      'FolioleCompanionReviewWriteContract.swift',
      'FolioleCompanionReviewWriteStore.swift',
      'FolioleCompanionSyncPlugin+ReviewWrite.swift'
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
