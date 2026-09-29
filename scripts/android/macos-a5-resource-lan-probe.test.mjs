import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { assertOwnedResourcePath, verifyA5ResourceLanProbe } from './macos-a5-resource-lan-probe.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
vi.mock('./macos-a5-sync-group-maintenance-action.mjs', () => ({
  runMacosA5InstrumentationMechanics: vi.fn()
}));
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

it('returns the actual restoration timestamp after missing-resource verification', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-lan-')); roots.push(root);
  let restored = false;
  const phases = [];
  vi.mocked(runMacosA5InstrumentationMechanics).mockImplementation(async (options) => {
    const phase = options.instrumentationArgs[2];
    phases.push({ phase, restored });
    return { evidencePath: path.join(root, phase) };
  });
  const before = Date.now();
  const result = await verifyA5ResourceLanProbe({ args: {
    checked: vi.fn(), paths: { adb: 'fixed-adapter' }, serial: 'fixed'
  }, buildIdentity: 'candidate', env: {}, evidenceRoot: root, groupId: 'group',
  fixture: { images: [{ hash: 'a'.repeat(64) }, { hash: 'b'.repeat(64) }],
    nodeId: 'resource-node', restore: () => { restored = true; } } });
  expect(phases).toEqual([{ phase: 'missing', restored: false },
    { phase: 'restored', restored: true }, { phase: 'restarted', restored: true }]);
  expect(Date.parse(result.restoredAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(result.restoredAt)).toBeLessThanOrEqual(Date.now());
  expect(JSON.parse(fs.readFileSync(path.join(root, 'resource-lan.json'), 'utf8')).restoredAt)
    .toBe(result.restoredAt);
});
