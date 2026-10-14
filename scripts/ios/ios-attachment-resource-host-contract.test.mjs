// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS attachment resource host contract', () => {
  it('keeps Swift responsible only for attachment file resolution', () => {
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
    const implementation = read('ios/App/App/FolioleCompanionAttachmentSyncPlugin.swift');
    const methods = ['resolveAttachmentResource'];

    for (const method of methods) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(implementation).toContain(`@objc func ${method}`);
    }
    for (const retired of ['loadMissingAttachmentResource', 'loadMissingAttachmentResources', 'commitAttachmentResourceBatch',
      'downloadAttachmentResourceBatch', 'stageAttachmentResourceBatch', 'finishAttachmentResourceBatch']) {
      expect(plugin).not.toContain(`CAPPluginMethod(name: "${retired}"`);
      expect(implementation).not.toContain(`@objc func ${retired}`);
    }
    expect(implementation).toContain('FolioleCompanionCanonicalAttachmentKey.matches');
    expect(implementation).toContain('FolioleCompanionAttachmentResourceDownloader.digestHex');
    expect(implementation).not.toContain('FolioleCompanionDatabaseLocation');
  });
});
