import { expect, test } from './harness/fixtures';
import { card, continueXml, loadSource, openPreview, parameters, writeCollection } from './harness/superMemoImport';

test('updates the directory of an already imported card after previewing the original export', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('Update');
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Source article</Title>
    <Content><Question>Article text</Question></Content></SuperMemoElement>${card}</SuperMemoCollection>`;
  const readNodes = () => desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot');
    const nodes = Object.values(snapshot.nodesById);
    return { article: nodes.find(node => node.title === 'Source article'), card: nodes.find(node => node.title === 'Card') };
  });
  await loadSource(desktopApp, dialog, directory, xml);
  await continueXml(desktopWindow);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  const before = await readNodes();
  expect(before.card?.id).toBeTruthy();
  expect(before.card?.parentNodeId).not.toBe(before.article?.id);
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();

  await writeCollection(directory, true);
  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, directory);
  await reopened.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(reopened.getByRole('heading', { name: /^(Directory changes|目录位置变化)$/ })).toBeVisible();
  await expect(reopened.getByText(/→ Source article/)).toBeVisible();
  expect((await readNodes()).card?.parentNodeId).toBe(before.card?.parentNodeId);
  await reopened.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(reopened.getByText(/^(Updated directory locations \(1\)|已更新 1 个条目的位置。)$/)).toBeVisible();
  const after = await readNodes();
  expect(after.card?.id).toBe(before.card?.id);
  expect(after.card?.parentNodeId).toBe(before.article?.id);
});
