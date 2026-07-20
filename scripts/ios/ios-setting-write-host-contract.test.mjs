// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS setting write host contract', () => {
  it('registers the existing bridge method through a setting-specific adapter', async () => {
    const plugin = await appSource('FolioleCompanionSyncPlugin.swift');
    const adapter = await appSource('FolioleCompanionSyncPlugin+SettingWrite.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "saveSyncSettingRecord"');
    expect(adapter).toContain('@objc func saveSyncSettingRecord');
    expect(adapter).toContain('FolioleCompanionSettingWriteStore');
    expect(adapter).toContain('FolioleCompanionDatabaseLocation.mainDatabase()');
  });

  it('keeps SQL and identity in generated contracts instead of the plugin adapter', async () => {
    const adapter = await appSource('FolioleCompanionSyncPlugin+SettingWrite.swift');
    const store = await appSource('FolioleCompanionSettingWriteStore.swift');
    const query = await json('ios/App/App/companion-query-definitions.json');

    expect(adapter).not.toContain('INSERT ');
    expect(store).not.toContain('INSERT OR REPLACE INTO setting_records');
    expect(query.queries.syncPayloadSetting.syncPayload.defaultPlatform).toBe('ios');
    expect(query.queries.syncPayloadSetting.syncPayload.objectType).toBe('setting');
  });

  it('includes all setting writer sources in SwiftPM and the Xcode target', async () => {
    const packageFile = await readFile(path.join(REPO_ROOT, 'ios/App/Package.swift'), 'utf8');
    const project = await readFile(path.join(REPO_ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

    for (const file of [
      'FolioleCompanionSettingWriteContract.swift',
      'FolioleCompanionSettingWriteStore.swift',
      'FolioleCompanionSyncPlugin+SettingWrite.swift'
    ]) {
      expect(packageFile).toContain(file);
      expect(project).toContain(`${file} in Sources`);
    }
  });
});

function appSource(name) {
  return readFile(path.join(REPO_ROOT, 'ios/App/App', name), 'utf8');
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}
