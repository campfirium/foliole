import { expect, test } from './harness/fixtures';
import { loadSource, openPreview, seedHistoricalSuperMemoBatch, openSuperMemoUpdateReview, superMemoUpdateComplete } from './harness/superMemoImport';

test('imports a previously skipped card once into its saved batch', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const xml = `<SuperMemoCollection><Count>1</Count>
    <SuperMemoElement><ID>1</ID><Type>Item</Type><Title>Recovered card</Title>
    <Content><Question>Question</Question><Answer>Answer</Answer></Content>
    </SuperMemoElement></SuperMemoCollection>`;
  expect(await seedHistoricalSuperMemoBatch(desktopApp, [{
    id: 1, parentId: null, children: [], sourceType: 'Item', title: 'Recovered card', ordinal: null,
    bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0, learning: null
  }], { 1: { outcome: 'skipped' } })).toMatchObject({ imported: 0, skipped: 1 });
  const readCards = () => desktopWindow.evaluate(async () =>
    Object.values((await window.electronAPI!.invoke('load_workspace_snapshot')).nodesById)
      .filter(node => node.title === 'Recovered card').map(node => node.id));
  const directory = testInfo.outputPath('MissingCard');
  await loadSource(desktopApp, dialog, directory, xml);
  const review = await openSuperMemoUpdateReview(dialog);
  await expect(review.getByText(/Import skipped material into|补入上次跳过的资料/)).toBeVisible();
  expect(await readCards()).toEqual([]);
  await review.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(superMemoUpdateComplete(desktopWindow).getByText(/Skipped materials imported \(1\)|已补入 1 条上次跳过的资料/)).toBeVisible();
  const after = await readCards();
  expect(after).toHaveLength(1);
  await superMemoUpdateComplete(desktopWindow).press('Escape');
  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, directory);
  const nextReview = await openSuperMemoUpdateReview(reopened);
  await expect(nextReview.getByRole('button', { name: /^(Confirm Update|确认更新)$/ })).toBeDisabled();
  expect(await readCards()).toEqual(after);
});
