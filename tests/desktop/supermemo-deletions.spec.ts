import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { gradesStep, loadSource, openPreview, openSuperMemoUpdateReview, parameters, superMemoImportComplete, superMemoUpdateComplete } from './harness/superMemoImport';

const update = /^(Update XML|更新 XML)$/;
const deletionPage = /^(Deletion records|删除记录)$/;
const title = 'Imported reading';
const xml = `<SuperMemoCollection><Count>1</Count><SuperMemoElement>
  <ID>1</ID><Type>Topic</Type><Title>${title}</Title><Content><Question>Read this.</Question></Content>
  </SuperMemoElement></SuperMemoCollection>`;

async function deleteImportedReading(desktopWindow: Page, desktopApp: ElectronApplication, testInfo: TestInfo) {
  for (const permanent of [false, true]) {
    await desktopApp.evaluate(async ({ app }, { title, permanent }) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
      const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${app.getAppPath()}/database/connection.js`);
      const nodes = require(`${app.getAppPath()}/database/nodeMutations.js`);
      await runWithDatabaseConnectionOwner(() => {
        const id = openDatabaseConnection().sqlite.prepare('SELECT id FROM nodes WHERE title = ?').pluck().get(title);
        if (permanent) nodes.deleteNodesPermanently({ nodeIds: [id] });
        else nodes.softDeleteNodes({ nodeIds: [id], deletedAt: new Date().toISOString() });
      });
    }, { title, permanent });
    const dialog = await openPreview(desktopWindow);
    await dialog.getByRole('button', { name: deletionPage }).click();
    await expect(dialog.getByRole('listitem').filter({ hasText: title })).toContainText(permanent
      ? /Permanently deleted|已彻底删除/ : /In Trash|在回收站/);
    const entries = await desktopWindow.evaluate(async () =>
      (await window.electronAPI!.invoke('get_supermemo_source_selection'))?.deletedEntries);
    expect(entries).toEqual([{ title, sourceId: 1, status: permanent ? 'permanent' : 'trash' }]);
    if (permanent) await dialog.screenshot({ path: testInfo.outputPath('deletion-records.png') });
    await dialog.press('Escape');
    await desktopWindow.keyboard.press('Escape');
  }
}

async function saveInLegacyFormat(desktopApp: ElectronApplication) {
  // Reopen a migration saved by the previous single-source JSON format.
  await desktopApp.evaluate(async ({ app }) => {
    const fs = process.getBuiltinModule('fs/promises')!;
    const path = process.getBuiltinModule('path')!;
    const dir = path.join(app.getPath('userData'), 'supermemo-migration');
    const [name] = (await fs.readdir(dir)).filter(file => file.endsWith('.json'));
    const file = path.join(dir, name!);
    const store = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify(store.sources[store.activeFilePath]));
  });
}

async function expectSavedSources(desktopApp: ElectronApplication, firstPath?: string, secondPath?: string) {
  const json = await desktopApp.evaluate(async ({ app }) => {
    const fs = process.getBuiltinModule('fs/promises')!;
    const path = process.getBuiltinModule('path')!;
    const dir = path.join(app.getPath('userData'), 'supermemo-migration');
    const files = (await fs.readdir(dir)).filter(name => name.endsWith('.json'));
    const [file] = files;
    const store = JSON.parse(await fs.readFile(path.join(dir, file!), 'utf8'));
    return { files, activeFilePath: store.activeFilePath, sourcePaths: Object.keys(store.sources) };
  });
  expect(json.files).toHaveLength(1);
  expect(json.activeFilePath).toBe(firstPath);
  expect(json.sourcePaths).toEqual(expect.arrayContaining([firstPath, secondPath]));
  expect(json.sourcePaths).toHaveLength(2);
}

async function confirmLearningUpdate(desktopApp: ElectronApplication, dialog: Locator, learning: string, newTitle: string) {
  await loadSource(desktopApp, dialog, learning, undefined, update);
  const review = await openSuperMemoUpdateReview(dialog);
  await review.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(superMemoUpdateComplete(dialog.page())).toBeVisible();
  const titles = await dialog.page().evaluate(async () =>
    Object.values((await window.electronAPI!.invoke('load_workspace_snapshot')).nodesById).map(node => node.title));
  expect(titles).toContain(newTitle);
  expect(titles).not.toContain(title);
}

test('keeps each XML’s settings and deletion records when switching sources', async ({ desktopWindow, desktopApp }, testInfo) => {
  let dialog = await openPreview(desktopWindow);
  await expect(dialog.getByRole('button', { name: deletionPage })).toHaveCount(0);
  const learning = testInfo.outputPath('Learning');
  await loadSource(desktopApp, dialog, learning, xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
  const complete = superMemoImportComplete(desktopWindow);
  await expect(complete).toBeVisible();
  await complete.press('Escape');
  await desktopWindow.keyboard.press('Escape');

  await deleteImportedReading(desktopWindow, desktopApp, testInfo);

  dialog = await openPreview(desktopWindow);
  const current = () => desktopWindow.evaluate(() => window.electronAPI!.invoke('get_supermemo_source_selection', undefined));
  const prior = await current();
  expect(prior?.savedForm.percent).toBe(100);
  expect(prior?.deletedEntries).toEqual([{ title, sourceId: 1, status: 'permanent' }]);

  await saveInLegacyFormat(desktopApp);
  await loadSource(desktopApp, dialog, learning, undefined, update);
  await expect(dialog.getByRole('button', { name: deletionPage })).toBeEnabled();
  expect(await current()).toMatchObject({ filePath: prior?.filePath, deletedEntries: prior?.deletedEntries });

  const change = /^(Change XML|更换 XML)$/;
  await loadSource(desktopApp, dialog, testInfo.outputPath('Broken'), '<broken>', change);
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await current()).toMatchObject({ filePath: prior?.filePath, deletedEntries: prior?.deletedEntries });
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();

  const other = 'A different source';
  await loadSource(desktopApp, dialog, testInfo.outputPath('Other'), xml.replace(title, other).replace('Read this.', 'Another passage.'), change);
  await expect(dialog.getByRole('button', { name: new RegExp(other) })).toBeVisible();
  await expect(dialog.getByRole('button', { name: deletionPage })).toHaveCount(0);
  const switched = await current();
  expect(switched?.filePath).toMatch(/Other\.xml$/);
  expect(switched?.deletedEntries).toBeUndefined();
  expect(switched?.panel?.batchId).toBeUndefined();

  await dialog.press('Escape');
  await desktopWindow.keyboard.press('Escape');
  await desktopWindow.reload();
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('button', { name: new RegExp(other) })).toBeVisible();
  expect(await current()).toEqual(switched);
  expect(switched?.savedForm.percent).toBe(0);

  const newTitle = 'New reading from Learning';
  const revisedXml = xml.replace('<Count>1</Count>', '<Count>2</Count>').replace('</SuperMemoCollection>',
    `<SuperMemoElement><ID>2</ID><Type>Topic</Type><Title>${newTitle}</Title>
      <Content><Question>A new passage.</Question></Content></SuperMemoElement></SuperMemoCollection>`);
  await loadSource(desktopApp, reopened, learning, revisedXml, change);
  await expect.poll(current).toMatchObject({ filePath: prior?.filePath, deletedEntries: prior?.deletedEntries,
    savedForm: { percent: 100 }, panel: { batchId: prior?.panel?.batchId } });
  const changed = desktopWindow.getByRole('dialog', { name: /^(SuperMemo source changed|SuperMemo 来源已变化)$/ });
  await changed.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await reopened.getByRole('button', { name: deletionPage }).click();
  await expect(reopened.getByRole('listitem').filter({ hasText: title })).toContainText(/Permanently deleted|已彻底删除/);

  await confirmLearningUpdate(desktopApp, reopened, learning, newTitle);

  await expectSavedSources(desktopApp, prior?.filePath, switched?.filePath);
});
