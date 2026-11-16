import { expect, test } from './harness/fixtures';
import { continueXml, loadSource, openPreview, seedHistoricalSuperMemoBatch } from './harness/superMemoImport';

test('withdraws a checked item and restores it from Trash', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const xml = `<SuperMemoCollection><Count>1</Count>
    <SuperMemoElement><ID>1</ID><Type>Item</Type><Title>Obsolete card</Title></SuperMemoElement>
    </SuperMemoCollection>`;
  await seedHistoricalSuperMemoBatch(desktopApp, [{
    id: 1, parentId: null, children: [], sourceType: 'Item', title: 'Obsolete card', ordinal: null,
    bodyOrQuestionHtml: [], answerHtml: [], skippedAudioComponents: 0, learning: null
  }], { 1: { outcome: 'item', issue: null } }, { 1: { bodyOrQuestionHtml: ['Old question'], answerHtml: ['Old answer'] } });
  const card = () => desktopWindow.evaluate(async () => {
    const { nodesById, trashedNodeIds } = await window.electronAPI!.invoke('load_workspace_snapshot');
    const node = Object.values(nodesById).find(entry => entry.title === 'Obsolete card');
    return { id: node?.id, inTrash: !!node && trashedNodeIds.includes(node.id) };
  });
  const before = await card();
  expect(before.id).toBeTruthy();
  await loadSource(desktopApp, dialog, testInfo.outputPath('Withdrawal'), xml);
  await continueXml(desktopWindow);
  await dialog.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  const checkbox = dialog.getByRole('checkbox', { name: 'Obsolete card' });
  const confirm = dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ });
  await expect(checkbox).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await checkbox.check();
  expect(await card()).toEqual(before);
  await confirm.click();
  await expect(dialog.getByText(/Moved to Trash \(1\)|已将 1 条资料移到回收站/)).toBeVisible();
  expect(await card()).toEqual({ ...before, inTrash: true });

  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await desktopWindow.keyboard.press('Escape');
  await desktopWindow.getByRole('treeitem', { name: /^(Trash|回收站)$/ }).click();
  const trashed = desktopWindow.getByRole('tree', { name: /^(Trash topics|废纸篓主题)$/ })
    .getByRole('treeitem', { name: /^Obsolete card(?:\s|$)/ });
  await trashed.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Restore|恢复)$/ }).click();
  await expect.poll(card).toEqual(before);
});
