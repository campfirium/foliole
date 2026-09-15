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
import { stableReadwiseEpubNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { buildReadwiseApiEpubBodyOverwrite } from './readwiseApiEpubBodyRepair.js';
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

it('overwrites bodies from API HTML without changing the existing node scope', () => {
  const childId = stableReadwiseEpubNodeId('connection', 'document', 'section');
  const before = new Map([
    ['root', { content: '# Book\n\n![Book cover](asset://cover.jpg)\n\nOld root', id: 'root', title: 'Book' }],
    [childId, { content: 'Old section', id: childId, title: 'Section' }]
  ]);
  const desired = buildReadwiseApiEpubBodyOverwrite({
    connectionRef: 'connection', documentId: 'document', nodeId: 'root', title: 'Book'
  }, before, {
    accounting: {
      conversionDroppedCount: 0, localizedBodyCount: 0, sourceBodyCount: 0,
      treeBodyCount: 0, unavailableBodyCount: 0
    },
    degradedReason: null,
    rootAttachmentIds: [],
    rootBody: 'New root from API HTML',
    sections: [{
      attachmentIds: [], content: 'New section from API HTML', headingLevel: 1,
      markerKey: 'section', title: 'Section'
    }]
  });

  expect(desired.map((item) => item.nodeId)).toEqual(['root', childId]);
  expect(desired.map((item) => item.content)).toEqual([
    '# Book\n\n![Book cover](asset://cover.jpg)\n\nNew root from API HTML',
    'New section from API HTML'
  ]);
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
