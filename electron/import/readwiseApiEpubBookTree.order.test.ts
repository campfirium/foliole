// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { persistReadwiseApiEpubBookNodes } from './readwiseApiEpubBookTree.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  const driver = openDatabaseConnection().driver;
  for (const [nodeId, title] of [['root', 'Book'], ['sibling', 'Sibling']] as const) {
    upsertNodeSnapshot(driver, {
      anchorLink: null, content: '', createdAt: '2026-09-13T00:00:00.000Z', hideTitleHeading: false,
      isTitleManual: true, kind: 'topic', nodeId, parentNodeId: null, position: null, reveal: null,
      title, updatedAt: '2026-09-13T00:00:00.000Z'
    });
  }
  rewriteExistingNodeOrder(driver, ['root', 'sibling']);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps rebuilt EPUB topics in the source order directly after their root', () => {
  persist(['first', 'second']);
  expect(readOrderedTitles()).toEqual(['Book', 'first', 'second', 'Sibling']);

  persist(['second', 'first']);
  expect(readOrderedTitles()).toEqual(['Book', 'second', 'first', 'Sibling']);
});

it('keeps reading state when an existing generated topic is rebuilt', () => {
  persist(['first']);
  const driver = openDatabaseConnection().driver;
  const nodeId = driver.queryOne<{ id: string }>("SELECT id FROM nodes WHERE title='first'")!.id;
  driver.execute(`INSERT INTO node_reading (
    node_id,interval_duration_ms,interval_growth_factor,last_handled_at,next_at,priority,repetition_count,state
  ) VALUES (?,1000,1.5,'2026-09-13T01:00:00.000Z','2026-09-14T01:00:00.000Z',4,3,'active')`, [nodeId]);

  persist(['first']);

  expect(driver.queryOne('SELECT * FROM node_reading WHERE node_id=?', [nodeId])).toMatchObject({
    interval_duration_ms: 1000, priority: 4, repetition_count: 3, state: 'active'
  });
});

function persist(titles: string[]) {
  persistReadwiseApiEpubBookNodes({
    connectionRef: 'connection', documentId: 'document', importedAt: new Date().toISOString(),
    nodes: titles.map((title) => ({ attachmentIds: [], content: title, key: title, parentKey: null, title })),
    rootNodeId: 'root'
  });
}

function readOrderedTitles() {
  return openDatabaseConnection().driver.queryAll<{ title: string }>(
    `SELECT nodes.title FROM node_order JOIN nodes ON nodes.id = node_order.node_id
     WHERE nodes.deleted_at IS NULL ORDER BY node_order.position`
  ).map((row) => row.title);
}
