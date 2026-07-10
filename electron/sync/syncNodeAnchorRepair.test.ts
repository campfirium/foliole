// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-node-anchor-repair-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-node-anchor-repair-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('repairs unique direct child text anchors after a remote parent content apply', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  insertLocalNode({ anchorLink: textAnchor('anchor-1', 6, 10, 'Beta'), id: 'child-1', parentId: 'parent-1' });

  const result = await applyRecords([parentRecord('Start Alpha Beta Gamma')]);
  const child = readAnchor('child-1');

  expect(result.anchorRepairRecords).toEqual([{ anchorId: 'anchor-1', nodeId: 'child-1', parentNodeId: 'parent-1' }]);
  expect(result.unmappedAnchorRecords).toEqual([]);
  expect(JSON.parse(child.anchor_link ?? '{}').locator).toMatchObject({ from: 12, originalText: 'Beta', to: 16 });
  expect(child.updated_at).toBe('2026-05-10T08:00:00.000Z');
});

it('leaves ambiguous child anchors unchanged and reports them as unmapped', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  const oldAnchor = textAnchor('anchor-1', 6, 10, 'Beta');
  insertLocalNode({ anchorLink: oldAnchor, id: 'child-1', parentId: 'parent-1' });

  const result = await applyRecords([parentRecord('Beta Alpha Beta Gamma')]);

  expect(result.anchorRepairRecords).toEqual([]);
  expect(result.unmappedAnchorRecords).toEqual([
    { anchorId: 'anchor-1', nodeId: 'child-1', parentNodeId: 'parent-1', reason: 'ambiguous_text' }
  ]);
  expect(readAnchor('child-1').anchor_link).toBe(oldAnchor);
});

it('only repairs direct children of the applied parent and skips deleted children', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  insertLocalNode({ anchorLink: textAnchor('anchor-1', 6, 10, 'Beta'), id: 'child-1', parentId: 'parent-1' });
  insertLocalNode({ anchorLink: textAnchor('anchor-2', 6, 10, 'Beta'), id: 'nested-1', parentId: 'child-1' });
  insertLocalNode({
    anchorLink: textAnchor('anchor-3', 6, 10, 'Beta'),
    deletedAt: '2026-05-10T07:30:00.000Z',
    id: 'deleted-1',
    parentId: 'parent-1'
  });

  const result = await applyRecords([parentRecord('Start Alpha Beta Gamma')]);

  expect(result.anchorRepairRecords).toEqual([{ anchorId: 'anchor-1', nodeId: 'child-1', parentNodeId: 'parent-1' }]);
  expect(JSON.parse(readAnchor('nested-1').anchor_link ?? '{}').locator).toMatchObject({ from: 6, to: 10 });
  expect(JSON.parse(readAnchor('deleted-1').anchor_link ?? '{}').locator).toMatchObject({ from: 6, to: 10 });
});

it('lets a child record in the same batch overwrite any parent-step repair', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  insertLocalNode({
    anchorLink: textAnchor('anchor-1', 6, 10, 'Beta'),
    id: 'child-1',
    parentId: 'parent-1',
    versionId: 'desktop#child-v1'
  });
  const remoteChildAnchor = textAnchor('anchor-1', 0, 12, 'Remote child');

  await applyRecords([
    parentRecord('Start Alpha Beta Gamma'),
    childRecord({ anchorLink: remoteChildAnchor, content: 'Remote child body' })
  ]);

  expect(readAnchor('child-1').anchor_link).toBe(remoteChildAnchor);
});

it('reports non-text locators without crashing', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  insertLocalNode({
    anchorLink: JSON.stringify({ id: 'anchor-visual', kind: 'highlight', locator: { page: 1, x: 0.5, y: 0.5 } }),
    id: 'child-1',
    parentId: 'parent-1'
  });

  const result = await applyRecords([parentRecord('Start Alpha Beta Gamma')]);

  expect(result.unmappedAnchorRecords).toEqual([
    { anchorId: 'anchor-visual', nodeId: 'child-1', parentNodeId: 'parent-1', reason: 'non_text_locator' }
  ]);
});

it('repairs range anchors only when every range has a unique remap', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  insertLocalNode({ anchorLink: rangeAnchor('anchor-1'), id: 'child-1', parentId: 'parent-1' });

  const result = await applyRecords([parentRecord('Start Alpha Beta Gamma')]);
  const locator = JSON.parse(readAnchor('child-1').anchor_link ?? '{}').locator;

  expect(result.unmappedAnchorRecords).toEqual([]);
  expect(locator.ranges).toMatchObject([
    { from: 6, originalText: 'Alpha', to: 11 },
    { from: 17, originalText: 'Gamma', to: 22 }
  ]);
});

it('leaves range anchors unchanged when any range cannot be uniquely repaired', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  const oldAnchor = JSON.stringify({
    id: 'anchor-1',
    kind: 'highlight',
    locator: { ranges: [{ from: 6, originalText: 'Beta', to: 10 }, { from: 11, originalText: 'Gamma', to: 16 }] }
  });
  insertLocalNode({ anchorLink: oldAnchor, id: 'child-1', parentId: 'parent-1' });

  const result = await applyRecords([parentRecord('Zero Alpha Beta Beta Gamma')]);

  expect(result.unmappedAnchorRecords).toEqual([
    { anchorId: 'anchor-1', nodeId: 'child-1', parentNodeId: 'parent-1', reason: 'ambiguous_text' }
  ]);
  expect(readAnchor('child-1').anchor_link).toBe(oldAnchor);
});

async function applyRecords(records: NativeSyncNodeRecord[]) {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-node-anchor-repair-test' });
  return applySyncNodesWithDbPort(port, records);
}

function insertLocalNode(args: {
  anchorLink?: string | null;
  content?: string;
  deletedAt?: string | null;
  id: string;
  parentId?: string | null;
  versionId?: string;
}) {
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, anchor_link, current_version_id,
       last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', ?, ?, ?, ?, 'desktop', 0, ?, ?, ?)`
  ).run(
    args.id,
    args.parentId ?? null,
    args.id,
    args.content ?? `${args.id} body`,
    args.anchorLink ?? null,
    args.versionId ?? `desktop#${args.id}-v1`,
    '2026-05-10T07:00:00.000Z',
    '2026-05-10T07:00:00.000Z',
    args.deletedAt ?? null
  );
}

function parentRecord(content: string): NativeSyncNodeRecord {
  return nodeRecord({ content, id: 'parent-1', parentVersionId: 'desktop#parent-v1', versionId: 'phone#parent-v2' });
}

function childRecord(args: { anchorLink: string; content: string }): NativeSyncNodeRecord {
  return nodeRecord({
    anchorLink: args.anchorLink,
    content: args.content,
    id: 'child-1',
    parentId: 'parent-1',
    parentVersionId: 'desktop#child-v1',
    versionId: 'phone#child-v2'
  });
}

function nodeRecord(args: {
  anchorLink?: string | null;
  content: string;
  id: string;
  parentId?: string | null;
  parentVersionId: string;
  versionId: string;
}): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [args.parentVersionId],
    content_hash: `${args.versionId}-hash`,
    device_id: 'phone',
    object_id: args.id,
    object_type: 'node',
    parent_version_id: args.parentVersionId,
    snapshot: {
      anchor_link: args.anchorLink ?? null,
      attachments: [],
      content: args.content,
      created_at: '2026-05-10T07:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: args.id,
      image_regions: null,
      is_title_manual: true,
      kind: 'topic',
      opening_text: null,
      parent_id: args.parentId ?? null,
      position: 0,
      priority: null,
      reveal: null,
      title: args.id,
      updated_at: '2026-05-10T08:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-10T08:00:00.000Z',
    version_created_at: '2026-05-10T08:00:00.000Z',
    version_id: args.versionId
  };
}

function textAnchor(id: string, from: number, to: number, originalText: string) {
  return JSON.stringify({ id, kind: 'highlight', locator: { from, originalText, to } });
}

function rangeAnchor(id: string) {
  return JSON.stringify({
    id,
    kind: 'highlight',
    locator: { ranges: [{ from: 0, originalText: 'Alpha', to: 5 }, { from: 11, originalText: 'Gamma', to: 16 }] }
  });
}

function readAnchor(nodeId: string) {
  return openDatabaseConnection().sqlite.prepare(
    'SELECT anchor_link, updated_at FROM nodes WHERE id = ?'
  ).get(nodeId) as { anchor_link: string | null; updated_at: string };
}
