import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { pressWorkspaceHistory } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const PARENT = 'delete-parent-topic';
const CHILD = 'delete-parent-item';

async function seedImageCloze(app: ElectronApplication, page: Page) {
  const bytesBase64 = await app.evaluate(({ nativeImage }) => {
    const pathApi = process.getBuiltinModule('path')!;
    return nativeImage.createFromPath(pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png'))
      .resize({ width: 240 }).toPNG().toString('base64');
  });
  await page.evaluate(async ({ bytesBase64, parent, child }) => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([{ id: 'image-bootstrap', kind: 'topic', title: 'Image fixture', content: '' }]);
    const attachmentId = await api.importClipboardImageAttachment({ bytesBase64, mimeType: 'image/png', nodeId: 'image-bootstrap' });
    if (!attachmentId) throw new Error('missing image fixture');
    const region = { id: 'region', x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    const content = `![Image](asset://${attachmentId}.png)`;
    const imageRegions = [{ attachmentId, regions: [region] }];
    await api.seedNodes([
      { id: parent, kind: 'topic', title: 'Image deletion transaction', content, imageRegions },
      { id: child, kind: 'item', parentNodeId: parent, title: 'Image cloze', content, imageRegions,
        anchorLink: { id: region.id, kind: 'cloze', locator: { attachmentId, ...region } } }
    ]);
    await api.openNode(parent);
  }, { bytesBase64, parent: PARENT, child: CHILD });
}

async function databaseState(app: ElectronApplication, action: 'read' | 'reject-parent' | 'allow-parent' = 'read') {
  return app.evaluate((_, { action, parent, child }) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const database = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return database.runWithDatabaseConnectionOwner(() => {
      const { sqlite } = database.openDatabaseConnection();
      if (action === 'reject-parent') {
        sqlite.exec(`CREATE TEMP TRIGGER reject_parent BEFORE UPDATE OF image_regions ON nodes
          WHEN NEW.id = '${parent}' BEGIN SELECT RAISE(ABORT, 'injected parent failure'); END`);
      } else if (action === 'allow-parent') {
        sqlite.exec('DROP TRIGGER reject_parent');
      }
      return sqlite.prepare('SELECT id, deleted_at, image_regions, content, body_blob_hash FROM nodes WHERE id IN (?, ?) ORDER BY id')
        .all(parent, child);
    });
  }, { action, parent: PARENT, child: CHILD });
}

async function expectChildTrashed(page: Page, trashed: boolean) {
  await expect.poll(() => page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode(id)?.trashed, CHILD)).toBe(trashed);
}

async function deleteChild(page: Page) {
  await page.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode(id), CHILD);
}

test('rolls back a failed image parent write, then durably deletes, undoes and redoes the child', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedImageCloze(desktopApp, page);
  const regions = page.locator('.cm-md-image-cloze-region');
  await expect(regions).toHaveCount(1);
  const before = await databaseState(desktopApp, 'reject-parent');
  expect(before).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: PARENT, image_regions: expect.any(String), body_blob_hash: expect.any(String) })
  ]));
  await deleteChild(page);
  await expectChildTrashed(page, false);
  await expect(regions).toHaveCount(1);
  await expect(page.getByText('Could not move to Trash. Please try again.', { exact: true })).toBeVisible();
  expect(await databaseState(desktopApp)).toEqual(before);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/desktop-acceptance/t229-delete-rollback.png') });
  await databaseState(desktopApp, 'allow-parent');
  await deleteChild(page);
  await expectChildTrashed(page, true);
  await expect(regions).toHaveCount(0);
  const deleted = await databaseState(desktopApp);
  expect(deleted).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: PARENT, image_regions: null }),
    expect.objectContaining({ id: CHILD, deleted_at: expect.any(String) })
  ]));
  await databaseState(desktopApp, 'reject-parent');
  await pressWorkspaceHistory(page, 'undo');
  await expect(page.getByText('Could not update Trash. Please try again.', { exact: true })).toBeVisible();
  await expectChildTrashed(page, true);
  await expect(regions).toHaveCount(0);
  expect(await databaseState(desktopApp)).toEqual(deleted);
  await databaseState(desktopApp, 'allow-parent');
  await pressWorkspaceHistory(page, 'undo');
  await expectChildTrashed(page, false);
  await expect(regions).toHaveCount(1);
  expect(await databaseState(desktopApp)).toEqual(before);
  await pressWorkspaceHistory(page, 'redo');
  await expectChildTrashed(page, true);
  await expect(regions).toHaveCount(0);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async (id) => window.__folioleWorkspaceDebug?.openNode(id), PARENT);
  await expectChildTrashed(page, true);
  await expect(regions).toHaveCount(0);
  expect(await databaseState(desktopApp)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: PARENT, image_regions: null }),
    expect.objectContaining({ id: CHILD, deleted_at: expect.any(String) })
  ]));
  await page.screenshot({ path: path.resolve('.tmp/artifacts/desktop-acceptance/t229-delete-reload.png') });
});
