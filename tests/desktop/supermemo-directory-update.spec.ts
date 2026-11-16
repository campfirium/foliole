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

test('shows and confirms a missing parent and its existing child as one update', async ({ desktopWindow, desktopApp }, testInfo) => {
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Missing parent</Title>
    <Content><Question>Original source text</Question></Content>
    <SuperMemoElement><ID>2</ID><Type>Item</Type><Title>Existing child</Title>
    <Content><Question>Question</Question><Answer>Answer</Answer></Content>
    </SuperMemoElement></SuperMemoElement></SuperMemoCollection>`;
  const batch = await desktopApp.evaluate(async ({ app }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const { runWithDatabaseConnectionOwner } = require(`${app.getAppPath()}/database/connection.js`);
    const { handleSuperMemoImportCommand } = require(`${app.getAppPath()}/ipc/superMemoImportCommands.js`);
    const { runSuperMemoImport } = require(`${app.getAppPath()}/import/runSuperMemoImport.js`);
    const { loadReviewSchedulerSettings } = require(`${app.getAppPath()}/reviewSchedulerSettings.js`);
    const elements = [
      { id: 1, parentId: null, children: [2], sourceType: 'Topic', title: 'Missing parent', ordinal: null,
        bodyOrQuestionHtml: ['Original source text'], answerHtml: [], skippedAudioComponents: 0, learning: null },
      { id: 2, parentId: 1, children: [], sourceType: 'Item', title: 'Existing child', ordinal: null,
        bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0, learning: null }
    ];
    const preview = await handleSuperMemoImportCommand('preview_supermemo_import', { elements });
    preview.rows[0].outcome = 'skipped';
    return runWithDatabaseConnectionOwner(() => runSuperMemoImport({ elements, preview, percent: 0, offset: '+00:00',
      gradeMap: [1, 1, 1, 2, 3, 4], scheduler: loadReviewSchedulerSettings(), expectedImages: new Map(),
      sourceFormat: { placement: 'topic-info', template: '' } }));
  });
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
