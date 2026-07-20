// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const methods = [
  'commitContentBlobBatch',
  'downloadContentBlobBatch',
  'loadMissingContentBlobHashes'
];

describe('iOS content blob host contract', () => {
  it('registers every shared content-body bridge method on the iOS plugin', () => {
    const controller = read('ios/App/App/FolioleBridgeViewController.swift');
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');

    expect(controller).toContain('registerPluginInstance(FolioleCompanionSyncPlugin())');
    for (const method of methods) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(plugin).toContain(`@objc func ${method}`);
    }
    expect(plugin).toContain('FolioleCompanionDatabaseLocation.mainDatabase()');
    expect(plugin).toContain('contentBlobContract()');
  });

  it('keeps the content bridge implementation in both iOS build graphs', () => {
    const fileName = 'FolioleCompanionSyncPlugin.swift';
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const packageSource = read('ios/App/Package.swift');

    expect(project).toContain(`${fileName} in Sources`);
    expect(packageSource).toContain(`"${fileName}"`);
  });
});
