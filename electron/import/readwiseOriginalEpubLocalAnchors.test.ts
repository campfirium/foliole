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
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { relocateReadwiseOriginalEpubLocalAnchors } from './readwiseOriginalEpubLocalAnchors.js';
import { ensureReadwiseUnlocatedNode } from './readwiseOriginalEpubUnlocated.js';

const importedAt = '2026-09-17T01:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-local-anchors-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('places an existing unlocated container last when no root-level anchor needs moving', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
     VALUES ('book',NULL,'topic','Book',1,'',?,?),
       ('chapter','book','topic','Chapter',1,'Body',?,?)`,
    [importedAt, importedAt, importedAt, importedAt]
  );
  const unlocated = ensureReadwiseUnlocatedNode({
    connectionRef: 'connection', documentId: 'document', driver, importedAt, rootNodeId: 'book'
  });
  driver.execute(
    `INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
     VALUES ('missing',?,'topic','Missing',1,'Kept',?,?)`,
    [unlocated, importedAt, importedAt]
  );
  rewriteExistingNodeOrder(driver, ['book', 'chapter']);

  expect(relocateReadwiseOriginalEpubLocalAnchors({
    annotationStates: [], bodies: [{ content: 'Body', id: 'chapter' }], connectionRef: 'connection',
    documentId: 'document', importedAt, rootNodeId: 'book'
  })).toBe(0);
  expect(driver.queryAll<{ title: string }>(
    `SELECT child.title FROM node_order ordered JOIN nodes child ON child.id=ordered.node_id
     WHERE child.parent_id='book' ORDER BY ordered.position`
  )).toEqual([{ title: 'Chapter' }, { title: '※' }]);
});
