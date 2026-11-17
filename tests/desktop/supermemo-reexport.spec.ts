import { expect, test } from './harness/fixtures';
import { loadSource, openPreview, parameters } from './harness/superMemoImport';

function exportXml(questions: string[]) {
  return `<SuperMemoCollection><Count>${questions.length}</Count>${questions.map((question, index) => `
    <SuperMemoElement><ID>${index + 1}</ID><Type>Item</Type><Title>Entry ${index + 1}</Title>
    <Content><Question>${question}</Question><Answer>Answer</Answer></Content></SuperMemoElement>`).join('')}</SuperMemoCollection>`;
}

test('links a verified new export to the original batch and refuses a mismatched library', async ({ desktopWindow, desktopApp }, testInfo) => {
  const original = testInfo.outputPath('Original');
  const wrong = testInfo.outputPath('Foreign');
  const newer = testInfo.outputPath('Newer');
  const first = await openPreview(desktopWindow);
  await loadSource(desktopApp, first, original, exportXml(['First original question', 'Second original question']));
  await first.getByRole('button', { name: parameters }).click();
  await first.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(first.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  await first.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const nodes = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(nodesById).filter(node => /^Entry /u.test(node.title ?? ''))
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')).map(({ id }) => id);
  });
  const before = await nodes();
  expect(before).toHaveLength(2);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, original);
  const newButton = /^(Load newer export|载入重新导出的 XML)$/;
  const confirm = dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ });
  await loadSource(desktopApp, dialog, wrong, exportXml(['Foreign one', 'Foreign two']), newButton);
  await expect(dialog.getByText(/could not be verified against the saved batch|无法核实这份导出与原批次/)).toBeVisible();
  await expect(confirm).toBeDisabled();
  const updatedXml = exportXml(['First original question', 'Second original question', 'New question']);
  await loadSource(desktopApp, dialog, newer, updatedXml, newButton);
  await expect(dialog.getByText(/Matched 2 existing entries|已核实 2 条已有资料/)).toBeVisible();
  expect(await nodes()).toEqual(before);
  await confirm.click();
  await expect(dialog.getByText(/Linked the newer export|已将新导出关联到原批次/)).toBeVisible();
  const after = await nodes();
  expect(after).toHaveLength(3);
  expect(after.slice(0, 2)).toEqual(before);
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();

  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, newer);
  await reopened.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(reopened.getByRole('button', { name: /^(Confirm Update|确认更新)$/ })).toBeDisabled();
  expect(await nodes()).toEqual(after);
});
