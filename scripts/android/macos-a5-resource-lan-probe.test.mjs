import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { assertOwnedResourcePath, seedA5ResourceLanProbe, verifyA5ResourceLanProbe } from './macos-a5-resource-lan-probe.mjs';
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

it('commits both image descriptions with the fixture body before withholding bytes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-lan-seed-')); roots.push(root);
  const assets = path.join(root, 'Assets'); fs.mkdirSync(assets);
  let saved;
  const imported = [];
  const session = { invoke: async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: [] };
    if (command === 'create_topic') { saved = args; return { createdNodeIds: [args.nodeId] }; }
    if (command === 'load_library_path_settings') return { assets_dir: assets };
    const bytes = Buffer.from(args.bytesBase64, 'base64');
    const hash = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(assets, `${hash}.png`), bytes);
    imported.push({ storage_key: `${hash}.png`, original_name: args.originalName, role: 'image' });
    return { status: 'imported', attachment_id: hash, storage_key: `${hash}.png`, original_name: args.originalName };
  } };
  const fixture = await seedA5ResourceLanProbe(session, root);
  expect(saved.newImageReferences).toEqual(imported);
  expect(imported).toHaveLength(2);
  for (const item of imported) expect(saved.content).toContain(`asset://${item.storage_key}`);
  expect(fs.existsSync(fixture.missingPath)).toBe(false);
  fixture.restore();
  expect(fs.existsSync(fixture.missingPath)).toBe(true);
});
