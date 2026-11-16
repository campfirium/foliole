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
  const dialog = await openPreview(desktopWindow);
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

for (const missingParent of [false, true]) {
  test(`confirms an existing highlight against a ${missingParent ? 'missing' : 'present'} corrected parent`, async ({ desktopWindow, desktopApp }, testInfo) => {
    const dialog = await openPreview(desktopWindow);
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
    ], { 3: { parentId: 1 }, ...(missingParent ? { 2: { outcome: 'skipped' } } : {}) });
    const readLink = () => desktopWindow.evaluate(async () => {
      const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
      const node = Object.values(nodesById).find(entry => entry.title === 'Existing highlight');
      return { id: node?.id, parent: node?.parentNodeId ? nodesById[node.parentNodeId]?.title : undefined, anchor: node?.anchorLink };
    });
    const before = await readLink();
    expect(before).toMatchObject({ parent: 'Previous parent', anchor: { kind: 'highlight', locator: { from: 0 } } });
    await loadSource(desktopApp, dialog, testInfo.outputPath('ExistingHighlight'), xml);
    await continueXml(desktopWindow);
    await dialog.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
    if (missingParent) await expect(dialog.getByText(/Import missing parent|补入漏导的父项/)).toBeVisible();
    await expect(dialog.getByText(/Update the text anchor|同时更新文字定位/)).toBeVisible();
    await dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
    await expect(dialog.getByText(/Updated directory locations|已更新 1 个条目的位置/)).toBeVisible();
    expect(await readLink()).toMatchObject({ id: before.id, parent: 'Corrected parent',
      anchor: { id: before.anchor?.id, kind: 'highlight', locator: { from: newBody.indexOf(selection), originalText: selection } } });
  });
}

test('changes source information on the existing card from the saved batch', async ({ desktopWindow, desktopApp }, testInfo) => {
  const directory = testInfo.outputPath('SourceInformation');
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Source article</Title>
    <Content><Question>Article text</Question></Content></SuperMemoElement>${card}</SuperMemoCollection>`;
  await writeCollection(directory, true);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, directory, xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  const readCard = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    const node = Object.values(nodesById).find(entry => entry.title === 'Card');
    return node ? window.electronAPI!.invoke('load_node_document', { nodeId: node.id }) : null;
  });
  const before = await readCard();
  expect(before).toMatchObject({ content: 'Question', reveal: 'Answer' });
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, directory);
  await reopened.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await reopened.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ }).click();
  await expect(reopened.getByRole('heading', { name: /^(Source information changes|来源信息变化)$/ })).toBeVisible();
  expect(await readCard()).toEqual(before);
  await reopened.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(reopened.getByText(/Source information updated|已更新 1 处来源信息/)).toBeVisible();
  const after = await readCard();
  expect(after).toMatchObject({ nodeId: before?.nodeId, reveal: 'Answer' });
  expect(after?.content).toMatch(/^Question\n\nSource: \[\[node-id:.+\|Source article\]\]/u);
});

test('previews a changed conversion result and updates the answer in place', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const xml = `<SuperMemoCollection><Count>1</Count>
    <SuperMemoElement><ID>1</ID><Type>Item</Type><Title>Converted card</Title>
    <Content><Question>Original question</Question><Answer>New answer</Answer></Content>
    </SuperMemoElement></SuperMemoCollection>`;
  await seedHistoricalSuperMemoBatch(desktopApp, [{
    id: 1, parentId: null, children: [], sourceType: 'Item', title: 'Converted card', ordinal: null,
    bodyOrQuestionHtml: ['Original question'], answerHtml: ['New answer'], skippedAudioComponents: 0, learning: null
  }], {}, { 1: { answerHtml: ['Old answer'] } });
  const readCard = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    const node = Object.values(nodesById).find(entry => entry.title === 'Converted card');
    return node ? window.electronAPI!.invoke('load_node_document', { nodeId: node.id }) : null;
  });
  const before = await readCard();
  expect(before).toMatchObject({ content: 'Original question', reveal: 'Old answer' });
  await loadSource(desktopApp, dialog, testInfo.outputPath('TextUpdate'), xml);
  await continueXml(desktopWindow);
  await dialog.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(dialog.getByRole('heading', { name: /^(Text changes|文字内容变化)$/ })).toBeVisible();
  await expect(dialog.getByText(/^Converted card · (Answer|答案)$/)).toBeVisible();
  expect(await readCard()).toEqual(before);
  await dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(dialog.getByText(/Text fields updated \(1\)|已更新 1 个文字字段/)).toBeVisible();
  expect(await readCard()).toMatchObject({ nodeId: before?.nodeId, content: 'Original question', reveal: 'New answer' });
});

test('previews and recalculates an imported first review date', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const xml = `<SuperMemoCollection><Count>1</Count>
    <SuperMemoElement><ID>1</ID><Type>Item</Type><Title>Scheduled card</Title>
    <Content><Question>Question</Question><Answer>Answer</Answer></Content>
    <LearningData><LastRepetition>10.11.2026</LastRepetition><Interval>300</Interval></LearningData>
    </SuperMemoElement></SuperMemoCollection>`;
  await seedHistoricalSuperMemoBatch(desktopApp, [{
    id: 1, parentId: null, children: [], sourceType: 'Item', title: 'Scheduled card', ordinal: null,
    bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0,
    learning: { lastRepetition: '10.11.2026', intervalDays: '300', repetitions: null, lapses: null,
      sourceAFactor: null, sourceUFactor: null, history: [] }
  }], { 1: { sourceDue: '2027-08-01' } });
  const readCard = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    const node = Object.values(nodesById).find(entry => entry.title === 'Scheduled card');
    return { id: node?.id, day: node?.review?.due };
  });
  const before = await readCard();
  expect(before.day).toBe(new Date('2027-08-01T00:00:00').toISOString());
  await loadSource(desktopApp, dialog, testInfo.outputPath('FirstReview'), xml);
  await continueXml(desktopWindow);
  await dialog.getByRole('button', { name: /^(Update with New Rules|按新规则更新)$/ }).click();
  await expect(dialog.getByRole('heading', { name: /^(First review dates|首次到期日变化)$/ })).toBeVisible();
  await expect(dialog.getByText('2027-08-01 → 2027-09-06')).toBeVisible();
  expect(await readCard()).toEqual(before);
  await dialog.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(dialog.getByText(/First review schedules updated \(1\)|已更新 1 张卡的首次排程/)).toBeVisible();
  expect(await readCard()).toEqual({ id: before.id, day: new Date('2027-09-06T00:00:00').toISOString() });
});
