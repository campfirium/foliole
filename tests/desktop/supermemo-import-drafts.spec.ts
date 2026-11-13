import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const title = /^(SuperMemo import preview|SuperMemo 导入预览)$/;
const open = /^(Open preview|打开预览)$/;
const emptyCard = '<SuperMemoElement><ID>3</ID><Type>Item</Type><Title>Empty example</Title></SuperMemoElement>';
const card = `<SuperMemoElement><ID>2</ID><Type>Item</Type><Title>Card</Title>
  <Content><Question>Question</Question><Answer>Answer</Answer></Content>
  <LearningData><LastRepetition>10.11.2026</LastRepetition><Interval>300</Interval>
  <RepHist>ElNo=2 Rep=2 Laps=0 Date=10.11.2026 Hour=3.5 Int=1 Grade=4</RepHist></LearningData>
</SuperMemoElement>`;
const firstExport = `<SuperMemoCollection><Count>3</Count><SuperMemoElement>
  <ID>1</ID><Type>Topic</Type><Title>Archive</Title>${card}${emptyCard}</SuperMemoElement></SuperMemoCollection>`;
const secondExport = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;

async function openPreview(page: Page) {
  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /^(Storage|存储)$/ }).click();
  await settings.getByRole('button', { name: open }).click();
  return page.getByRole('dialog', { name: title });
}

test('previews different XML exports and changes the interval without saving a draft', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openPreview(desktopWindow);
  const input = dialog.locator('input[type="file"]');
  const selectXml = (name: string, text: string) =>
    input.setInputFiles({ name, mimeType: 'application/xml', buffer: Buffer.from(text) });
  await selectXml('Learning.xml', firstExport);
  const slider = dialog.getByRole('slider');
  await expect(slider).toHaveValue('0');
  await expect(dialog.getByRole('cell', { name: '300', exact: true })).toHaveCount(2);
  await slider.press('End');
  await expect(slider).toHaveValue('100');
  await expect(dialog.getByRole('cell', { name: '300', exact: true })).toHaveCount(1);
  await dialog.getByText(/^(View 1 exceptions|查看 1 条明细)$/).click();
  await expect(dialog.getByText('Empty example', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Archive', { exact: false })).toBeVisible();
  const folder = path.resolve('.tmp/artifacts/T762/desktop');
  await mkdir(folder, { recursive: true });
  await dialog.screenshot({ path: path.join(folder, 'supermemo-preview.png') });
  await selectXml('Broken.xml', '<broken>');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByText('Learning.xml')).toBeVisible();
  await selectXml('Other.xml', secondExport);
  await expect(dialog.getByText('Other.xml')).toBeVisible();
  await expect(slider).toHaveValue('0');
  await expect(dialog.getByText('Empty example', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('slider')).toHaveCount(0);
});

async function writeCollection(directory: string, includeTopic: boolean) {
  const info = path.join(directory, 'info');
  await mkdir(info, { recursive: true });
  const tree = Buffer.alloc(2 * 37);
  tree[0] = includeTopic ? 0 : 1;
  const elements = Buffer.alloc(2 * 118);
  elements.writeUInt16LE(300, 118 + 16);
  elements.writeInt16LE(30, 118 + 18);
  const repetitions = Buffer.alloc(8);
  repetitions.writeInt32LE(330, 4);
  const priorities = Buffer.from([2, 0, 0, 0]);
  const history = Buffer.alloc(39);
  history.writeInt32LE(2);
  history.writeUInt16LE(2, 4);
  history.writeDoubleLE((Date.UTC(2026, 10, 10) - Date.UTC(1899, 11, 30)) / 86_400_000, 10);
  history[24] = 4;
  await Promise.all(Object.entries({
    'contents.dat': tree, 'ElementInfo.dat': elements, 'repetitions.dat': repetitions,
    'priority.sub': priorities, 'RepetitionHistory.dat': history
  }).map(([name, bytes]) => writeFile(path.join(info, name), bytes)));
  return elements;
}

test('pairs the selected collection and preserves XML preview after a mismatch', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('collection');
  const elements = await writeCollection(directory, false);
  const info = path.join(directory, 'info');
  await desktopApp.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  }, directory);
  const input = dialog.locator('input[type="file"]');
  const pair = dialog.getByRole('button', { name: /^(Pair collection folder|配对资料库文件夹)$/ });
  await input.setInputFiles({ name: 'Other.xml', mimeType: 'application/xml', buffer: Buffer.from(secondExport) });
  await pair.click();
  await expect(dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/)).toBeVisible();
  elements.writeUInt16LE(200, 118 + 16);
  await writeFile(path.join(info, 'ElementInfo.dat'), elements);
  await pair.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('slider')).toHaveValue('0');
});

test('imports a Topic with an inline image and reopens a saved import batch', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('collection');
  await writeCollection(directory, true);
  const imageBase64 = await desktopApp.evaluate(({ nativeImage }) =>
    nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 255), { width: 32, height: 32 }).toPNG().toString('base64'));
  await writeFile(path.join(directory, 'map.png'), Buffer.from(imageBase64, 'base64'));
  await desktopApp.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  }, directory);
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Imported map topic</Title>
    <Content><Question><![CDATA[Before <img alt="Map" src="map.png"> after.]]></Question></Content>
    </SuperMemoElement>${card}</SuperMemoCollection>`;
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'Maps.xml', mimeType: 'application/xml', buffer: Buffer.from(xml)
  });
  await dialog.getByRole('button', { name: /^(Pair collection folder|配对资料库文件夹)$/ }).click();
  await expect(dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
  await expect(dialog.getByRole('status')).toHaveText(/Imported 2|已导入 2 条/);
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const reopened = await openPreview(desktopWindow);
  await reopened.getByRole('combobox').selectOption({ index: 1 });
  await reopened.getByRole('slider').press('End');
  await reopened.getByRole('button', { name: /^(Apply first review dates|应用首次复习日期)$/ }).click();
  await expect(reopened.getByText(/Updated 1|已更新 1 张/)).toBeVisible();
  await rm(directory, { recursive: true });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const nodeId = await desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(snapshot.nodesById).find(node => node.title === 'Imported map topic')?.id;
  });
  expect(nodeId).toBeTruthy();
  await desktopWindow.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id!), nodeId);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Before');
  const image = desktopWindow.getByRole('img', { name: 'Map', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(32);

});
