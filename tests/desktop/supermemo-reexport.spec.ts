import { expect, test } from './harness/fixtures';
import { gradesStep, loadSource, openPreview, parameters, superMemoImportComplete, openSuperMemoUpdateReview, superMemoUpdateComplete } from './harness/superMemoImport';

function exportXml(questions: string[]) {
  return `<SuperMemoCollection><Count>${questions.length}</Count>${questions.map((question, index) => `
    <SuperMemoElement><ID>${index + 1}</ID><Type>Item</Type><Title>Entry ${index + 1}</Title>
    <Content><Question>${question}</Question><Answer>Answer</Answer></Content></SuperMemoElement>`).join('')}</SuperMemoCollection>`;
}

test('links a verified new export to the original batch and refuses a mismatched library', async ({ desktopWindow, desktopApp }, testInfo) => {
  const original = testInfo.outputPath('Original');
  const wrong = testInfo.outputPath('Foreign');
  const first = await openPreview(desktopWindow);
  await loadSource(desktopApp, first, original, exportXml(['First original question', 'Second original question']));
  await first.getByRole('button', { name: parameters }).click();
  await first.getByRole('button', { name: gradesStep }).click();
  await first.getByRole('button', { name: /^(Import|导入)$/ }).click();
  await expect(superMemoImportComplete(desktopWindow)).toBeVisible();
  await superMemoImportComplete(desktopWindow).press('Escape');
  const nodes = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(nodesById).filter(node => /^Entry /u.test(node.title ?? ''))
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')).map(({ id }) => id);
  });
  const before = await nodes();
  expect(before).toHaveLength(2);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, original);
  const newButton = /^(Update XML|更新 XML)$/;
  const confirmUpdate = /^(Confirm Update|确认更新)$/;
  await loadSource(desktopApp, dialog, wrong, exportXml(['Foreign one', 'Foreign two']), newButton);
  await dialog.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
  await expect(dialog.getByRole('button', { name: /^(Change XML|更换 XML)$/ })).toBeVisible();
  await expect(dialog.getByText(/Original\.xml$/)).toBeVisible();
  await loadSource(desktopApp, dialog, original, exportXml(['Foreign one', 'Foreign two']), newButton);
  await expect(dialog.getByRole('alert')).toContainText(/could not be verified against the saved batch|无法核实这份导出与原批次/);
  expect(await nodes()).toEqual(before);
  const updatedXml = exportXml(['First original question', 'Second original question', 'New question']);
  await loadSource(desktopApp, dialog, original, updatedXml, newButton);
  const review = await openSuperMemoUpdateReview(dialog);
  await expect(review.getByText(/Matched 2 existing entries|已核实 2 条已有资料/)).toBeVisible();
  expect(await nodes()).toEqual(before);
  await review.getByRole('button', { name: confirmUpdate }).click();
  await expect(superMemoUpdateComplete(desktopWindow).getByText(/Linked the newer export|已将新导出关联到原批次/)).toBeVisible();
  const after = await nodes();
  expect(after).toHaveLength(3);
  expect(after.slice(0, 2)).toEqual(before);
  await superMemoUpdateComplete(desktopWindow).press('Escape');

  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, original);
  const reviewAgain = await openSuperMemoUpdateReview(reopened);
  await expect(reviewAgain.getByRole('button', { name: confirmUpdate })).toBeDisabled();
  expect(await nodes()).toEqual(after);
});
