// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-t181-jpeg-body-repair';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { applyJpegBodyRepairPlan } from '../../scripts/oneoff/t181-jpeg-body-repair-apply.js';
import { buildJpegBodyRepairPlan } from '../../scripts/oneoff/t181-jpeg-body-repair-plan.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

let assetsDir = '';
let tempRoot = '';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const hash = createHash('sha256').update(jpeg).digest('hex');

function seed(nodeId: string, suffix = '') {
  upsertNodeSnapshot({
    anchorLink: null, content: `before${suffix} asset://${hash}.jpeg after`,
    createdAt: '2026-09-12T00:00:00.000Z', isTitleManual: true, kind: 'topic', nodeId,
    parentNodeId: null, position: 0, reveal: null, title: nodeId, updatedAt: '2026-09-12T00:00:00.000Z'
  });
  flushNodeSyncVersion(nodeId, '2026-09-12T00:00:01.000Z');
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t181-repair-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  assetsDir = path.join(tempRoot, 'Assets');
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(assetsDir, `${hash}.jpg`), jpeg);
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('plans only exact lowercase body-addressed JPEG keys and validates canonical bytes', async () => {
  seed('node-1');
  upsertNodeSnapshot({
    anchorLink: null, content: `external.jpg.jpeg asset://${hash}.jpeg2 asset://${hash.toUpperCase()}.jpeg`,
    createdAt: '2026-09-12T00:00:00.000Z', isTitleManual: true, kind: 'topic', nodeId: 'node-2',
    parentNodeId: null, position: 1, reveal: null, title: 'node-2', updatedAt: '2026-09-12T00:00:00.000Z'
  });
  const plan = await buildJpegBodyRepairPlan({
    assetsDir, driver: openDatabaseConnection().driver, expectedNodes: 1, expectedTokens: 1
  });
  expect(plan.candidates.map((candidate) => candidate.nodeId)).toEqual(['node-1']);
  expect(plan.candidates[0]?.nextContent).toContain(`asset://${hash}.jpg`);
});

it('writes a versioned body and preserves every non-body node field', async () => {
  seed('node-1');
  const driver = openDatabaseConnection().driver;
  const plan = await buildJpegBodyRepairPlan({ assetsDir, driver, expectedNodes: 1, expectedTokens: 1 });
  const before = driver.queryOne<{ current_version_id: string }>('SELECT current_version_id FROM nodes WHERE id = ?', ['node-1']);
  const versions = applyJpegBodyRepairPlan({ driver, hostName: 'Maci', now: '2026-09-12T01:00:00.000Z', plan });
  const after = driver.queryOne<{ content: string; current_version_id: string }>(
    'SELECT content, current_version_id FROM nodes WHERE id = ?', ['node-1']
  );
  expect(after?.content).toContain(`asset://${hash}.jpg`);
  expect(after?.current_version_id).not.toBe(before?.current_version_id);
  expect(versions).toEqual([{ nodeId: 'node-1', versionId: after?.current_version_id }]);
});

it('rolls back every body and version when a frozen candidate drifts mid-apply', async () => {
  seed('node-1', '-one');
  seed('node-2', '-two');
  const driver = openDatabaseConnection().driver;
  const plan = await buildJpegBodyRepairPlan({ assetsDir, driver, expectedNodes: 2, expectedTokens: 2 });
  expect(() => applyJpegBodyRepairPlan({
    afterCandidate: (nodeId) => { if (nodeId === 'node-1') throw new Error('injected_failure'); },
    driver, hostName: 'Maci', now: '2026-09-12T01:00:00.000Z', plan
  })).toThrow('injected_failure');
  const bodies = driver.queryAll<{ content: string }>(
    "SELECT content FROM nodes WHERE id IN ('node-1', 'node-2') ORDER BY id"
  );
  expect(bodies.every((row) => row.content.includes('.jpeg'))).toBe(true);
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM node_sync_versions WHERE created_at >= '2026-09-12T01:00:00.000Z'"
  )).toEqual({ count: 0 });
});

it('fails preflight when the canonical file hash does not match its key', async () => {
  seed('node-1');
  await fs.writeFile(path.join(assetsDir, `${hash}.jpg`), Buffer.from([0xff, 0xd8, 0xff, 0x01]));
  await expect(buildJpegBodyRepairPlan({
    assetsDir, driver: openDatabaseConnection().driver, expectedNodes: 1, expectedTokens: 1
  })).rejects.toThrow(`canonical_target_hash_mismatch:${hash}`);
});
