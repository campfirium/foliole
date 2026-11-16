import { expect, test } from './harness/fixtures';
import { card, continueXml, loadSource, openPreview, parameters, seedHistoricalSuperMemoBatch, writeCollection } from './harness/superMemoImport';

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

test('shows and confirms a missing parent and its existing child as one update', async ({ desktopWindow, desktopApp }, testInfo) => {
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Missing parent</Title>
    <Content><Question>Original source text</Question></Content>
    <SuperMemoElement><ID>2</ID><Type>Item</Type><Title>Existing child</Title>
    <Content><Question>Question</Question><Answer>Answer</Answer></Content>
    </SuperMemoElement></SuperMemoElement></SuperMemoCollection>`;
  const batch = await seedHistoricalSuperMemoBatch(desktopApp, [
      { id: 1, parentId: null, children: [2], sourceType: 'Topic', title: 'Missing parent', ordinal: null,
        bodyOrQuestionHtml: ['Original source text'], answerHtml: [], skippedAudioComponents: 0, learning: null },
      { id: 2, parentId: 1, children: [], sourceType: 'Item', title: 'Existing child', ordinal: null,
        bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0, learning: null }
  ], { 1: { outcome: 'skipped' } });
  expect(batch).toMatchObject({ imported: 1, skipped: 1 });
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('MissingParent'), xml);
  await continueXml(desktopWindow);
  await dialog.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(dialog.getByText(/Import missing parent|补入漏导的父项/)).toBeVisible();
  await expect(dialog.getByText(/→ Missing parent/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(dialog.getByText(/Missing parents imported \(1\)|已补入 1 个漏导的父项/)).toBeVisible();
  const placed = await desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot');
    const nodes = Object.values(snapshot.nodesById);
    const child = nodes.find(node => node.title === 'Existing child');
    return nodes.find(node => node.id === child?.parentNodeId)?.title;
  });
  expect(placed).toBe('Missing parent');
});

test('confirms a corrected parent and links the existing highlight to its passage', async ({ desktopWindow, desktopApp }, testInfo) => {
  const selection = 'The selected sentence.';
  const newBody = 'Different introduction. ' + selection;
  const xml = `<SuperMemoCollection><Count>3</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Previous parent</Title>
    <Content><Question>${selection}</Question></Content></SuperMemoElement>
    <SuperMemoElement><ID>2</ID><Type>Topic</Type><Title>Corrected parent</Title>
    <Content><Question>${newBody}</Question></Content>
    <SuperMemoElement><ID>3</ID><Type>Topic</Type><Title>Existing highlight</Title>
    <Content><Question>${selection}</Question></Content></SuperMemoElement></SuperMemoElement></SuperMemoCollection>`;
  const fields = { parentId: null, children: [], sourceType: 'Topic', ordinal: null,
    answerHtml: [], skippedAudioComponents: 0, learning: null };
  await seedHistoricalSuperMemoBatch(desktopApp, [
    { ...fields, id: 1, title: 'Previous parent', bodyOrQuestionHtml: [selection] },
    { ...fields, id: 2, children: [3], title: 'Corrected parent', bodyOrQuestionHtml: [newBody] },
    { ...fields, id: 3, parentId: 2, title: 'Existing highlight', bodyOrQuestionHtml: [selection] }
  ], { 3: { parentId: 1 } });
  const readLink = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    const node = Object.values(nodesById).find(entry => entry.title === 'Existing highlight');
    return { id: node?.id, parent: node?.parentNodeId ? nodesById[node.parentNodeId]?.title : undefined, anchor: node?.anchorLink };
  });
  const before = await readLink();
  expect(before).toMatchObject({ parent: 'Previous parent', anchor: { kind: 'highlight', locator: { from: 0 } } });
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('ExistingHighlight'), xml);
  await continueXml(desktopWindow);
  await dialog.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(dialog.getByText(/Update the text anchor|同时更新文字定位/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(dialog.getByText(/Updated directory locations|已更新 1 个条目的位置/)).toBeVisible();
  expect(await readLink()).toMatchObject({ id: before.id, parent: 'Corrected parent',
    anchor: { id: before.anchor?.id, kind: 'highlight', locator: { from: newBody.indexOf(selection), originalText: selection } } });
});
