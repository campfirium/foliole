// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { getGuidedSampleContent } from '../../lib/core/guidedSample/guidedSampleContent.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { seedPendingGuidedSample } from './guidedSampleLibrarySeed.js';
import { consumeGuidedSampleStartup } from './guidedSampleSeedState.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshotWithOrder } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

const ASSET_DIRS = [path.resolve('public/guided-sample-assets')];
let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-guided-sample-seed-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

function readSample() {
  const snapshot = loadWorkspaceSnapshot({ includeBody: true })!;
  const nodes = snapshot.nodeOrder.map((nodeId) => snapshot.nodesById[nodeId]!);
  const sampleRoot = nodes.find((node) => node.parentNodeId === INBOX_NODE_ID) ?? null;
  const children = sampleRoot ? nodes.filter((node) => node.parentNodeId === sampleRoot.id) : [];
  return { children, nodeOrder: snapshot.nodeOrder, root: sampleRoot };
}

function readResourceReferences(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ resource_references: string | null }>(
    'SELECT resource_references FROM nodes WHERE id = ?', [nodeId]
  );
  return JSON.parse(row?.resource_references ?? '[]') as Array<{ storage_key: string }>;
}

function createUserTopic() {
  const timestamp = '2026-10-24T00:00:00.000Z';
  upsertNodeSnapshotWithOrder({
    anchorLink: null, content: '# My notes', createdAt: timestamp, isTitleManual: false, kind: 'topic',
    nodeId: 'user-topic', parentNodeId: INBOX_NODE_ID, position: null, reveal: null, title: 'My notes',
    updatedAt: timestamp
  }, [INBOX_NODE_ID, 'user-topic', ...loadWorkspaceSnapshot()!.nodeOrder.filter((id) => id !== INBOX_NODE_ID)]);
}

it('writes the localized guided sample into a new library once and hands it to the first startup', async () => {
  const pack = getGuidedSampleContent('de');
  const seeded = await seedPendingGuidedSample({ assetDirs: ASSET_DIRS, locale: 'de' });
  const sample = readSample();
  expect(sample.root?.title).toBe(pack.rootTitle);
  expect(sample.children.map((node) => node.title)).toEqual(pack.children.map((topic) => topic.title));
  expect(seeded).toEqual([sample.root!.id, ...sample.children.map((node) => node.id)]);
  expect(sample.nodeOrder.slice(0, seeded!.length + 1)).toEqual([INBOX_NODE_ID, ...seeded!]);
  expect(readResourceReferences(sample.root!.id).map((reference) => reference.storage_key))
    .toEqual(pack.root.attachmentIds.map((assetId) => `${assetId}.png`));

  expect(consumeGuidedSampleStartup()).toBe(sample.root!.id);
  expect(consumeGuidedSampleStartup()).toBeNull();
  await expect(seedPendingGuidedSample({ assetDirs: ASSET_DIRS, locale: 'de' })).resolves.toBeNull();
  expect(readSample().children).toHaveLength(pack.children.length);
});

it('keeps the sample text when its images cannot be read', async () => {
  const seeded = await seedPendingGuidedSample({ assetDirs: [path.join(root, 'missing-assets')], locale: 'en' });
  const sample = readSample();
  expect(seeded).toHaveLength(getGuidedSampleContent('en').children.length + 1);
  expect(sample.root?.content).toContain('asset://');
  expect(readResourceReferences(sample.root!.id)).toEqual([]);
});

it('never writes the sample into a library that already holds content', async () => {
  createUserTopic();
  await expect(seedPendingGuidedSample({ assetDirs: ASSET_DIRS, locale: 'en' })).resolves.toBeNull();
  expect(readSample().root?.id).toBe('user-topic');
  expect(readSample().children).toEqual([]);
  expect(consumeGuidedSampleStartup()).toBeNull();
});

it('leaves libraries created before the sample moved to library creation untouched', async () => {
  openDatabaseConnection().driver.execute("DELETE FROM workspace_meta WHERE key = 'guided_sample_seed'");
  await expect(seedPendingGuidedSample({ assetDirs: ASSET_DIRS, locale: 'en' })).resolves.toBeNull();
  expect(readSample().root).toBeNull();
});
