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
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { relocateReadwiseBookLocalAnchors } from './readwiseBookLocalAnchors.js';
import { ensureReadwiseUnlocatedNode } from './readwiseBookUnlocated.js';

const importedAt = '2026-09-17T01:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-local-anchors-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
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

  expect(relocateReadwiseBookLocalAnchors({
    annotationStates: [], bodies: [{ content: 'Body', id: 'chapter' }], connectionRef: 'connection',
    documentId: 'document', importedAt, rootNodeId: 'book'
  })).toBe(0);
  const siblings = driver.queryAll<{ id: string; title: string }>("SELECT id, title FROM nodes WHERE parent_id='book'");
  const byId = new Map(siblings.map((row) => [row.id, row.title]));
  expect(loadDerivedNodeOrder(driver).filter((id) => byId.has(id)).map((id) => byId.get(id)))
    .toEqual(['Chapter', '※']);
});


it('relocates a local automatic highlight using its complete hashed body', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('book',NULL,'topic','Book',1,'',?,?), ('local','book','topic','Display title',0,'',?,?), ('chapter','book','topic','Chapter',1,'',?,?)`,
    [importedAt, importedAt, importedAt, importedAt, importedAt, importedAt]);
  writeNodeBody({ driver, nodeId: 'local', title: 'Display title', content: 'Exact excerpt', updatedAt: importedAt });
  relocateReadwiseBookLocalAnchors({ annotationStates: [], bodies: [{ id: 'chapter', content: 'Before Exact excerpt After' }],
    connectionRef: 'connection', documentId: 'document', importedAt, rootNodeId: 'book' });
  expect(driver.queryOne<{ parent_id: string; anchor_link: string }>(
    "SELECT parent_id, anchor_link FROM nodes WHERE id='local'"))
    .toMatchObject({ parent_id: 'chapter', anchor_link: expect.stringContaining('Exact excerpt') });
});
