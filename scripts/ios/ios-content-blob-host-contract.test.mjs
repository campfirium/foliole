// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS content blob host contract', () => {
  it('keeps Swift responsible only for download, isolated pack staging, and cleanup', () => {
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');

    for (const method of ['downloadContentBlobBatch', 'finishContentBlobBatch']) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(plugin).toContain(`@objc func ${method}`);
    }
    for (const retired of ['loadMissingContentBlobHashes', 'commitContentBlobBatch']) {
      expect(plugin).not.toContain(`CAPPluginMethod(name: "${retired}"`);
      expect(plugin).not.toContain(`@objc func ${retired}`);
    }
    expect(plugin).toContain('FolioleCompanionContentBlobPack.create(parts: parts)');
    expect(plugin).not.toContain('FolioleCompanionDatabaseLocation');
  });

  it('rejects a failed native download instead of creating an empty staged pack', () => {
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
    const start = plugin.indexOf('@objc func downloadContentBlobBatch');
    const method = plugin.slice(start, plugin.indexOf('@objc func finishContentBlobBatch', start));

    expect(method).toContain('let parts = try await FolioleCompanionDesktopHttpClient.requestContentBlobBatch(');
    expect(method).not.toContain('try? await FolioleCompanionDesktopHttpClient.requestContentBlobBatch(');
    expect(method).toContain('call.reject("Failed to download companion content blobs:');
  });
});
