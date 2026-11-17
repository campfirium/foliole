import { expect, test } from './harness/fixtures';
import { card, confirmStep, loadSource, openPreview, sourceStep, structureStep, writeCollection } from './harness/superMemoImport';

const xml = `<SuperMemoCollection><Count>2</Count>
  <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Source article</Title>
  <Content><Question>Article text</Question></Content></SuperMemoElement>${card}</SuperMemoCollection>`;
const contentEnd = /^(End of each material’s content|所有材料的内容末尾)$/;

test('previews an actual card citation and saves the applied format through migration', async ({ desktopApp, desktopWindow }, testInfo) => {
  const directory = testInfo.outputPath('PairedExport');
  await writeCollection(directory, true);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, directory, xml);
  await expect(dialog.getByText('PairedExport.xml', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: sourceStep }).click();
  const preview = dialog.getByRole('region', { name: /^(Source preview|来源预览)$/ });
  const sample = preview.getByRole('article');
  await expect(sample).toContainText('Question');
  await expect(sample).toContainText('Answer');
  await expect(sample).not.toContainText('Source article');
  await dialog.getByRole('radio', { name: contentEnd }).click();
  const format = dialog.getByRole('textbox', { name: /^(Markdown format|Markdown 格式)$/ });
  await format.fill('Read in {articleLink}\nUnknown author: {author}');
  await dialog.getByRole('button', { name: /^(Apply format|应用格式)$/ }).click();
  await expect(sample).toContainText('Question\n\nRead in Source article');
  await expect(sample).not.toContainText('Unknown author');
  await dialog.getByRole('button', { name: structureStep }).click();
  await dialog.getByRole('button', { name: sourceStep }).click();
  await expect(dialog.getByRole('radio', { name: contentEnd })).toBeChecked();
  await expect(format).toHaveValue('Read in {articleLink}\nUnknown author: {author}');
  await expect(sample).toContainText('Read in Source article');
  await dialog.screenshot({ path: testInfo.outputPath('source-information.png') });

  await dialog.getByRole('button', { name: confirmStep }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  const imported = await desktopWindow.evaluate(async () => {
    const api = window.electronAPI!;
    const { nodesById } = await api.invoke('load_workspace_snapshot');
    const item = Object.values(nodesById).find(node => node.title === 'Card')!;
    const article = Object.values(nodesById).find(node => node.title === 'Source article')!;
    return { item: await api.invoke('load_node_document', { nodeId: item.id }), articleId: article.id };
  });
  expect(imported.item).toMatchObject({
    content: `Question\n\nRead in [[node-id:${imported.articleId}|Source article]]`,
    reveal: 'Answer'
  });
});

test('explains that an XML-only export has no source details to preview', async ({ desktopApp, desktopWindow }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('XmlOnly'), xml);
  await expect(dialog.getByText('XmlOnly.xml', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: sourceStep }).click();
  const preview = dialog.getByRole('region', { name: /^(Source preview|来源预览)$/ });
  await expect(preview.getByText(/The loaded files contain no source details to preview|已载入的文件中没有可预览的来源信息/)).toBeVisible();
  await dialog.getByRole('radio', { name: contentEnd }).click();
  await expect(preview.getByRole('article')).toHaveCount(0);
});
