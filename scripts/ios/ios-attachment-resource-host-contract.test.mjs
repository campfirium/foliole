// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const methods = [
  'commitAttachmentResourceBatch',
  'downloadAttachmentResourceBatch',
  'loadMissingAttachmentResource',
  'loadMissingAttachmentResources',
  'resolveAttachmentResource'
];

describe('iOS attachment resource host contract', () => {
  it('registers every shared attachment bridge method on the iOS plugin', () => {
    const controller = read('ios/App/App/FolioleBridgeViewController.swift');
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
    const implementation = read('ios/App/App/FolioleCompanionAttachmentSyncPlugin.swift');

    expect(controller).toContain('registerPluginInstance(FolioleCompanionSyncPlugin())');
    for (const method of methods) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(implementation).toContain(`@objc func ${method}`);
    }
    expect(implementation).toContain('FolioleCompanionContractStore().attachmentResourceContract()');
    expect(implementation).toContain('FolioleCompanionDatabaseLocation.mainDatabase()');
  });

  it('keeps the attachment bridge implementation in both iOS build graphs', () => {
    const fileName = 'FolioleCompanionAttachmentSyncPlugin.swift';
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const packageSource = read('ios/App/Package.swift');

    expect(project).toContain(`${fileName} in Sources`);
    expect(packageSource).toContain(`"${fileName}"`);
  });
});
