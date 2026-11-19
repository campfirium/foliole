import { expect, test } from './harness/fixtures';
import { confirmStep, gradesStep, loadSource, openPreview, parameters, superMemoImportComplete } from './harness/superMemoImport';

const sourceReference = '<hr SuperMemo><SuperMemoReference><font class="reference">'
  + '#Title: Original title<br>#Author: Jane Doe<br>#Link: <a href="https://example.com/article">Original page</a><br>#Source: Example'
  + '</font></SuperMemoReference>';
const xml = `<SuperMemoCollection><Count>3</Count>
  <SuperMemoElement><ID>1</ID><Type>Topic</Type>
    <Content><Question><![CDATA[<p>Question text</p>${sourceReference}]]></Question></Content>
    <SuperMemoElement><ID>2</ID><Type>Item</Type><Title>Card</Title>
      <Content><Question><![CDATA[<p>Question text</p>${sourceReference}]]></Question><Answer>Answer</Answer></Content>
    </SuperMemoElement>
    <SuperMemoElement><ID>3</ID><Type>Item</Type><Title>Different card</Title>
      <Content><Question><![CDATA[<p>Other question</p>${sourceReference.replace('Jane Doe', 'John Doe')}]]></Question><Answer>Answer</Answer></Content>
    </SuperMemoElement>
  </SuperMemoElement></SuperMemoCollection>`;

test('combines grade and reference settings, remembers mappings, and writes the chosen Meta fields', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('XmlOnly'), xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('button', { name: /^(Next|下一步)$/ }).click();
  await expect(dialog.getByRole('button', { name: gradesStep })).toHaveAttribute('aria-current', 'step');
  await expect(dialog.getByRole('button', { name: confirmStep })).toHaveCount(0);
  const preview = dialog.getByRole('article', { name: /^(Preview|预览)$/ });
  const author = dialog.getByRole('textbox', { name: /^(Author import field name|Author 导入字段名)$/ });
  const source = dialog.getByRole('textbox', { name: /^(Source import field name|Source 导入字段名)$/ });
  const convert = dialog.getByRole('button', { name: /^(Import|导入)$/ });
  await expect(author).toHaveValue('Author');
  await author.fill('Title');
  await expect(convert).toBeDisabled();
  await author.fill('byline');
  await source.fill('');
  await preview.getByRole('button', { name: 'meta', exact: true }).click();
  await expect(preview.locator('pre')).toContainText('byline: Campfirium');
  await expect(preview.locator('pre')).toContainText('Date: 2026-02-25');
  await expect(preview.locator('pre')).not.toContainText('Source:');
  await expect(preview.locator('pre')).not.toContainText('Article:');
  await dialog.getByRole('button', { name: /^(Back|上一步)$/ }).click();
  await dialog.getByRole('button', { name: /^(Next|下一步)$/ }).click();
  await expect(author).toHaveValue('byline');
  await dialog.press('Escape');
  await openPreview(desktopWindow);
  await expect(author).toHaveValue('byline');
  await expect(source).toHaveValue('');
  await preview.getByRole('button', { name: 'meta', exact: true }).click();
  await dialog.screenshot({ path: testInfo.outputPath('import-settings.png') });
  await convert.click();
  await expect(superMemoImportComplete(desktopWindow)).toBeVisible();

  const imported = await desktopWindow.evaluate(async () => {
    const api = window.electronAPI!;
    const { nodesById } = await api.invoke('load_workspace_snapshot');
    const nodes = Object.values(nodesById);
    return Promise.all(['Original title', 'Card', 'Different card'].map(title => {
      const node = nodes.find(item => item.title === title)!;
      return api.invoke('load_node_document', { nodeId: node.id });
    }));
  });
  expect(imported[0]?.content).toBe('---\nTitle: "Original title"\nbyline: "Jane Doe"\n'
    + 'Link: "https://example.com/article"\n---\n\n# Original title\n\nQuestion text');
  expect(imported[1]).toMatchObject({ content: 'Question text', reveal: 'Answer' });
  expect(imported[2]).toMatchObject({ content: 'Other question\n\nbyline: John Doe', reveal: 'Answer' });
});
