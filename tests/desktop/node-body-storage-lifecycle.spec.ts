import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 't280-body-storage';
const BODY = '---\nauthor: Ada\ncollections:\n  - "Guide"\n---\nComplete article 正文.\n';

test('preserves article and list metadata after collecting an unheld body and reloading', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id, kind: 'topic', title: 'Body storage lifecycle', content }
    ], { persist: true });
  }, { id: NODE_ID, content: BODY });
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  const result = await desktopApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const blobs = require(`${process.cwd()}/dist/lib/core/database/contentBodyBlobs.js`);
    const collector = require(`${process.cwd()}/dist/lib/core/database/textBodyBlobCollection.js`);
    const snapshots = require(`${process.cwd()}/dist/lib/core/database/workspaceListSnapshot.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite: db, driver } = connection.openDatabaseConnection();
      const node = db.prepare('SELECT content, body_blob_hash, current_version_id FROM nodes WHERE id = ?').get(id);
      const versionBefore = db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(node.current_version_id);
      const garbage = blobs.upsertTextBodyBlob(driver, 'Unused native fixture body', new Date().toISOString());
      const collection = collector.collectTextBodyBlobCandidates(driver, [node.body_blob_hash, garbage]);
      const again = collector.collectTextBodyBlobCandidates(driver, [garbage]);
      return { inline: node.content, metadata: snapshots.loadWorkspaceListSnapshot(driver).nodesById[id],
        garbage, collection, again, versionBefore,
        versionAfter: db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(node.current_version_id),
        currentBlobExists: Boolean(db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(node.body_blob_hash)),
        garbageExists: Boolean(db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(garbage)) };
    });
  }, NODE_ID);
  expect(result.inline).not.toContain('Complete article');
  expect(result.metadata).toMatchObject({ authorText: 'Ada', collections: ['Guide'] });
  expect(result.collection.deletedHashes).toEqual([result.garbage]);
  expect(result.again.deletedHashes).toEqual([]);
  expect(result.currentBlobExists).toBe(true);
  expect(result.garbageExists).toBe(false);
  expect(result.versionBefore).toBeDefined();
  expect(result.versionBefore.body_text).toBe(BODY);
  expect(result.versionAfter).toEqual(result.versionBefore);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(async () => (await loadNodeDocument(page, NODE_ID))?.content).toBe(BODY);
  await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), NODE_ID);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(BODY);
  await testInfo.attach('body-storage-lifecycle', {
    body: JSON.stringify(result, null, 2), contentType: 'application/json'
  });
});
