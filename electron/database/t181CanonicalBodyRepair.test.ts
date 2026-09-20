// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-t181-canonical-body-repair';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { applyCanonicalBodyRepairPlan } from '../../scripts/oneoff/t181-canonical-body-repair-apply.js';
import { buildCanonicalBodyRepairPlan } from '../../scripts/oneoff/t181-canonical-body-repair-plan.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const jpegHash = createHash('sha256').update(jpeg).digest('hex');
const pngHash = createHash('sha256').update(png).digest('hex');
let root = '';
let assetsDir = '';

function seed(nodeId: string, content: string, parentNodeId: string | null = null, anchorLink: unknown = null) {
  upsertNodeSnapshot({
    anchorLink: anchorLink as null, content,
    createdAt: '2026-09-20T00:00:00.000Z', isTitleManual: true,
    kind: 'topic', nodeId, parentNodeId, position: 0, reveal: null,
    title: nodeId, updatedAt: '2026-09-20T00:00:00.000Z'
  });
  flushNodeSyncVersion(nodeId, '2026-09-20T00:00:01.000Z');
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t181-canonical-'));
  appDataDir = path.join(root, 'app-data');
  assetsDir = path.join(root, 'Assets');
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(assetsDir, `${jpegHash}.jpg`), jpeg);
  await fs.writeFile(path.join(assetsDir, `${pngHash}.png`), png);
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { force: true, recursive: true });
});

it('maps JPEG and PNG by bytes, remaps child anchors, versions both, and becomes a no-op', async () => {
  const body = `![J](asset://${jpegHash}.jpeg)\nTarget sentence.\n![P](asset://${pngHash}.jpeg)`;
  seed('parent', body);
  seed('child', 'Target sentence.', 'parent', {
    id: 'anchor-1', kind: 'highlight',
    locator: { from: body.indexOf('Target sentence.'),
      originalText: 'Target sentence.', to: body.indexOf('Target sentence.') + 16 }
  });
  const driver = openDatabaseConnection().driver;
  const plan = await buildCanonicalBodyRepairPlan({ assetsDir, driver, expectedNodes: 1, expectedTokens: 2 });
  expect(plan.candidates[0]?.mappings.map((entry) => entry.canonicalKey))
    .toEqual([`${jpegHash}.jpg`, `${pngHash}.png`]);
  expect(plan.candidates[0]?.children.map((entry) => entry.nodeId)).toEqual(['child']);
  const before = driver.queryOne<{ current_version_id: string }>(
    'SELECT current_version_id FROM nodes WHERE id = ?', ['parent']
  );
  const versions = applyCanonicalBodyRepairPlan({
    driver, hostName: 'Maci', now: '2026-09-20T01:00:00.000Z', plan
  });
  expect(versions.map((entry) => entry.nodeId)).toEqual(['parent', 'child']);
  const parent = driver.queryOne<{ content: string; current_version_id: string; updated_at: string }>(
    'SELECT content, current_version_id, updated_at FROM nodes WHERE id = ?', ['parent']
  );
  expect(parent?.content).toContain(`asset://${jpegHash}.jpg`);
  expect(parent?.content).toContain(`asset://${pngHash}.png`);
  expect(parent?.content).not.toContain('.jpeg');
  expect(parent?.current_version_id).not.toBe(before?.current_version_id);
  expect(parent?.updated_at).toBe('2026-09-20T01:00:00.000Z');
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', ['child']))
    .toEqual({ content: 'Target sentence.' });
  const repeat = await buildCanonicalBodyRepairPlan({ assetsDir, driver, expectedNodes: 0, expectedTokens: 0 });
  expect(applyCanonicalBodyRepairPlan({ driver, hostName: 'Maci',
    now: '2026-09-20T02:00:00.000Z', plan: repeat })).toEqual([]);
});

it('rejects multiple same-hash targets and wrong target bytes before writing', async () => {
  seed('parent', `asset://${jpegHash}.jpeg`);
  const driver = openDatabaseConnection().driver;
  await fs.writeFile(path.join(assetsDir, `${jpegHash}.png`), jpeg);
  await expect(buildCanonicalBodyRepairPlan({ assetsDir, driver }))
    .rejects.toThrow(`canonical_target_count:${jpegHash}:2`);
  await fs.unlink(path.join(assetsDir, `${jpegHash}.png`));
  await fs.writeFile(path.join(assetsDir, `${jpegHash}.jpg`), Buffer.from([0xff, 0xd8, 0xff, 0x01]));
  await expect(buildCanonicalBodyRepairPlan({ assetsDir, driver }))
    .rejects.toThrow(`canonical_target_hash_mismatch:${jpegHash}`);
});

it('rejects frozen parent or child drift and rolls back a mid-transaction failure', async () => {
  const body = `asset://${jpegHash}.jpeg Target`;
  seed('parent', body);
  seed('child', 'Target', 'parent', {
    id: 'anchor-2', kind: 'highlight',
    locator: { from: body.indexOf('Target'), originalText: 'Target', to: body.length }
  });
  const driver = openDatabaseConnection().driver;
  const plan = await buildCanonicalBodyRepairPlan({ assetsDir, driver });
  const beforeVersions = driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM node_sync_versions');
  expect(() => applyCanonicalBodyRepairPlan({
    driver, hostName: 'Maci', now: '2026-09-20T01:00:00.000Z', plan,
    afterCandidate: () => { throw new Error('injected_failure'); }
  })).toThrow('injected_failure');
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM node_sync_versions'))
    .toEqual(beforeVersions);
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', ['parent']))
    .toEqual({ content: body });
  expect(() => applyCanonicalBodyRepairPlan({
    driver, hostName: 'Maci', now: '2026-09-20T01:00:00.000Z', plan,
    verifyBeforeCommit: () => { throw new Error('protected_invariant_changed'); }
  })).toThrow('protected_invariant_changed');
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM node_sync_versions'))
    .toEqual(beforeVersions);
  driver.execute('UPDATE nodes SET title = ? WHERE id = ?', ['changed', 'child']);
  expect(() => applyCanonicalBodyRepairPlan({
    driver, hostName: 'Maci', now: '2026-09-20T01:00:00.000Z', plan
  })).toThrow('repair_candidate_drifted');
});
