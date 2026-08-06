// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS attachment resource host contract', () => {
  it('keeps Swift responsible only for file download, staging, resolution, and cleanup', () => {
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
    const implementation = read('ios/App/App/FolioleCompanionAttachmentSyncPlugin.swift');
    const methods = [
      'downloadAttachmentResourceBatch', 'finishAttachmentResourceBatch',
      'resolveAttachmentResource', 'stageAttachmentResourceBatch'
    ];

    for (const method of methods) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(implementation).toContain(`@objc func ${method}`);
    }
    for (const retired of ['loadMissingAttachmentResource', 'loadMissingAttachmentResources', 'commitAttachmentResourceBatch']) {
      expect(plugin).not.toContain(`CAPPluginMethod(name: "${retired}"`);
      expect(implementation).not.toContain(`@objc func ${retired}`);
    }
    expect(implementation).toContain('FolioleCompanionAttachmentFileStage.stage');
    expect(implementation).not.toContain('FolioleCompanionDatabaseLocation');
  });
});
