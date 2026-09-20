import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { assertOwnedResourcePath } from './macos-a5-resource-lan-probe.mjs';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
it('confines missing-file injection to the explicit isolated library and canonical key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-lan-')); roots.push(root);
  const library = path.join(root, 'isolated'); const assets = path.join(library, 'Assets');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(assets, { recursive: true }); fs.mkdirSync(outside);
  const key = `${'a'.repeat(64)}.png`;
  expect(assertOwnedResourcePath(library, assets, key)).toBe(path.join(fs.realpathSync(assets), key));
  expect(() => assertOwnedResourcePath(library, outside, key)).toThrow('isolated acceptance library');
  expect(() => assertOwnedResourcePath(library, assets, '../outside')).toThrow('isolated acceptance library');
  const link = path.join(library, 'linked'); fs.symlinkSync(outside, link);
  expect(() => assertOwnedResourcePath(library, link, key)).toThrow('isolated acceptance library');
});
