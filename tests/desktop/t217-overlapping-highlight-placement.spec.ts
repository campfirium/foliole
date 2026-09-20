import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t217');

test('opens overlap-rejected content from the unlocated area after reload', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const ids = await desktopApp.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const placement = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiEpubAnnotationPlacement.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const body = 'Before. Exact excerpt. After.';
      driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
        VALUES ('t217-book',NULL,'topic','T217 Book',1,'','2026-09-20','2026-09-20'),
          ('t217-chapter','t217-book','topic','T217 Chapter',1,?,'2026-09-20','2026-09-20')`, [body]);
      placement.placeReadwiseApiEpubAnnotations({
        annotations: ['first', 'second'].map((remoteId) => ({
          content: 'Exact excerpt.', contentHash: remoteId, kind: 'highlight', locatorText: 'Exact excerpt.',
          parentRemoteId: 'document', remoteId, updatedAt: '2026-09-20'
        })),
        annotationStates: [], bodies: [{ content: body, id: 't217-chapter' }],
        connectionRef: 't217', documentId: 'document', importedAt: '2026-09-20',
        relocationPolicy: 'unique', rootNodeId: 't217-book'
      });
      const rejected = driver.queryOne(`SELECT id,parent_id FROM nodes
        WHERE id LIKE 'node-readwise-%' AND content='Exact excerpt.' AND anchor_link IS NULL`);
      return { rejectedId: rejected.id, unlocatedId: rejected.parent_id };
    });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const snapshot = await desktopWindow.evaluate(async () => window.electronAPI.invoke('load_workspace_snapshot', {}));
  expect(snapshot.nodesById[ids.unlocatedId]).toMatchObject({ parentNodeId: 't217-book', title: '※' });
  expect(snapshot.nodesById[ids.rejectedId]).toMatchObject({ parentNodeId: ids.unlocatedId });
  expect(await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode(nodeId), ids.rejectedId))
    .toBe(true);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Exact excerpt.');
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(ARTIFACT_DIR, 'unlocated-highlight.png') });
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.openNode('t217-chapter'))).toBe(true);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toContainText('Exact excerpt.');
  await desktopWindow.screenshot({ path: path.join(ARTIFACT_DIR, 'anchored-highlight.png') });
});
