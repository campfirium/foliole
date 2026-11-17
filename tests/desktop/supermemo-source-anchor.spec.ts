import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { card, loadSource, openPreview, parameters, writeCollection } from './harness/superMemoImport';

const passage = 'A verified selection in the source article.';
const xml = `<SuperMemoCollection><Count>4</Count>
  <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Source article</Title>
    <Content><Question><![CDATA[<p><span class="extract">${passage}</span></p>]]></Question></Content></SuperMemoElement>
  ${card}
  <SuperMemoElement><ID>4</ID><Type>Topic</Type><Title>Directory topic</Title>
    <Content><Question>This topic discusses something else.</Question></Content>
    <SuperMemoElement><ID>3</ID><Type>Topic</Type><Title>Moved excerpt</Title>
      <Content><Question>${passage}</Question></Content></SuperMemoElement>
  </SuperMemoElement>
</SuperMemoCollection>`;

async function writeMovedExcerptCollection(directory: string, articleId = 1) {
  const initial = await writeCollection(directory, true);
  const info = path.join(directory, 'info');
  const elements = Buffer.alloc(4 * 118);
  initial.copy(elements);
  elements.writeUInt32LE(articleId, 2 * 118 + 93);
  const tree = Buffer.alloc(4 * 37);
  tree.writeInt32LE(4, 2 * 37 + 1);
  tree.writeInt32LE(3, 3 * 37 + 5);
  const repetitions = Buffer.alloc(4 * 4);
  (await readFile(path.join(info, 'repetitions.dat'))).copy(repetitions);
  await Promise.all([
    writeFile(path.join(info, 'contents.dat'), tree),
    writeFile(path.join(info, 'ElementInfo.dat'), elements),
    writeFile(path.join(info, 'repetitions.dat'), repetitions)
  ]);
}

test('previews a moved excerpt under its source article and renders its imported highlight', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('source-anchor');
  await writeMovedExcerptCollection(directory);
  await loadSource(desktopApp, dialog, directory, xml);
  const articleButton = dialog.getByRole('button', { name: /^Source article\s*#1$/ });
  await expect(articleButton).toBeVisible();
  const articleBranch = articleButton.locator('xpath=ancestor::li[1]');
  await expect(articleBranch.getByRole('button', { name: /^Moved excerpt\s*#3$/ })).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 4|已导入 4 条)/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await desktopWindow.keyboard.press('Escape');
  await desktopWindow.getByRole('treeitem', { name: 'Source article', exact: true }).click();
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toHaveText(passage);
});

test('updates the same excerpt and restores its source highlight from the original export', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('source-anchor-update');
  await writeMovedExcerptCollection(directory, 0);
  await loadSource(desktopApp, dialog, directory, xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 4|已导入 4 条)/)).toBeVisible();
  const readExcerpt = () => desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(snapshot.nodesById).find(node => node.title === 'Moved excerpt');
  });
  const before = await readExcerpt();
  expect(before?.id).toBeTruthy();
  expect(before?.anchorLink).toBeNull();
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();

  await writeMovedExcerptCollection(directory);
  const update = await openPreview(desktopWindow);
  await loadSource(desktopApp, update, directory);
  await update.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(update.getByText(/^(Restore the text anchor|补回文字定位)$/)).toBeVisible();
  expect(await readExcerpt()).toEqual(before);
  await update.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(update.getByText(/Restored 1 text anchors|已补回 1 处文字定位/)).toBeVisible();
  expect((await readExcerpt())?.id).toBe(before?.id);
  await update.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await desktopWindow.keyboard.press('Escape');
  await desktopWindow.getByRole('treeitem', { name: 'Source article', exact: true }).click();
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toHaveText(passage);
});
