import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, loadSource, openPreview, parameters, writeCollection } from './harness/superMemoImport';

const emptyCard = '<SuperMemoElement><ID>3</ID><Type>Item</Type><Title>Empty example</Title></SuperMemoElement>';
const firstExport = `<SuperMemoCollection><Count>4</Count><SuperMemoElement>
  <ID>4</ID><Type>Topic</Type><Ordinal>0</Ordinal><Content><Question>Welcome sample</Question></Content><SuperMemoElement>
  <ID>1</ID><Type>Topic</Type><Title>Archive</Title>${card}${emptyCard}</SuperMemoElement></SuperMemoElement></SuperMemoCollection>`;
const back = /^(Back to preview|返回资料预览)$/;
const secondExport = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;

async function dismissLoadError(page: Page) {
  const notice = page.getByRole('dialog', { name: /^(Could not load SuperMemo|无法载入 SuperMemo)$/ });
  await notice.getByRole('button', { name: /^(Close|关闭)$/ }).click();
}

test('previews different XML exports and retains the conversion draft after dismissing the panel', async ({ desktopWindow, desktopApp }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openPreview(desktopWindow);
  const preview = dialog.getByRole('region', { name: /^(Preview|预览)$/ });
  await expect(preview.getByText(/Choose a SuperMemo XML export|载入 SuperMemo 的 XML 导出/)).toHaveCount(0);
  const note = dialog.getByRole('note');
  await expect(note).toBeVisible();
  await expect(preview.getByRole('note')).toHaveCount(0);
  const settingsBounds = await desktopWindow.locator('[data-settings-root-dialog]').boundingBox();
  expect(settingsBounds).not.toBeNull();
  expect(await dialog.boundingBox()).toEqual(settingsBounds);
  await desktopWindow.screenshot({ path: testInfo.outputPath('supermemo-converter-empty.png') });
  await loadSource(desktopApp, dialog, testInfo.outputPath('Learning'), firstExport);
  await expect(preview.getByText('Welcome sample', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Collection root.*#4|资料库根项.*#4/i })).toBeVisible();
  await dialog.getByRole('button', { name: /^Card.*#2$/ }).click();
  await expect(preview.getByText('Question', { exact: true })).toBeVisible();
  await expect(preview.getByText('Answer', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^(Skipped 1|跳过 1)$/ }).click();
  await expect(dialog.getByRole('button', { name: /Empty example/ })).toBeVisible();
  await expect(preview.getByText(/Question and answer are empty|题面和答案均为空/)).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  const slider = dialog.getByRole('slider');
  await expect(slider).toHaveValue('0');
  await expect(dialog.getByText(/If only one date is available|只有一个日期可用/u)).toBeVisible();
  await expect(dialog.getByRole('row').filter({ hasText: '200+' }).getByRole('cell').last()).toHaveText('0');
  await slider.press('End');
  await expect(slider).toHaveValue('100');
  await expect(note).toBeHidden();
  await expect(dialog.getByRole('row').filter({ hasText: '200+' }).getByRole('cell').last()).not.toHaveText('0');
  await desktopWindow.mouse.click(3, 3);
  await expect(slider).toHaveValue('100');
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: /^(Start migration|开始迁移)$/ })).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(desktopWindow.getByRole('button', { name: /^(Start migration|开始迁移)$/ })).toBeHidden();
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('slider')).toHaveValue('100');
  await reopened.getByRole('button', { name: back }).click();
  await expect(dialog.getByRole('button', { name: /Empty example/ })).toBeVisible();
  await expect(note).toBeVisible();
  const folder = path.resolve('.tmp/artifacts/T762/desktop');
  await mkdir(folder, { recursive: true });
  await dialog.screenshot({ path: path.join(folder, 'supermemo-preview.png') });
  await loadSource(desktopApp, dialog, testInfo.outputPath('Broken'), '<broken>');
  await dismissLoadError(desktopWindow);
  await expect(dialog.getByText('Learning.xml', { exact: true })).toBeVisible();
  await loadSource(desktopApp, dialog, testInfo.outputPath('Other'), secondExport);
  await expect(dialog.getByText('Other.xml', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Skipped 0|跳过 0)$/ })).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(slider).toHaveValue('0');

});

test('pairs the selected collection and preserves XML preview after a mismatch', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('collection');
  const elements = await writeCollection(directory, false);
  const info = path.join(directory, 'info');
  elements.writeUInt16LE(200, 118 + 16);
  await writeFile(path.join(info, 'ElementInfo.dat'), elements);
  await loadSource(desktopApp, dialog, directory, secondExport);
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByText(/The XML export estimates original due dates|XML 预览按上次复习日期/)).toBeVisible();
  await dialog.getByRole('button', { name: back }).click();
  elements.writeUInt16LE(300, 118 + 16);
  await writeFile(path.join(info, 'ElementInfo.dat'), elements);
  await loadSource(desktopApp, dialog, directory);
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/)).toBeVisible();
  await expect(dialog.getByText(/Dismissed Topics and Items stay dismissed|已结束学习的主题和检测项保留原状态/u)).toBeVisible();
  await expect(dialog.getByRole('slider')).toHaveValue('0');
});

test('imports a Topic with an inline image and reopens a saved import batch', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('collection');
  await writeCollection(directory, true);
  const imageBase64 = await desktopApp.evaluate(({ nativeImage }) =>
    nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 255), { width: 32, height: 32 }).toPNG().toString('base64'));
  await writeFile(path.join(directory, 'map.png'), Buffer.from(imageBase64, 'base64'));
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Imported map topic</Title>
    <Content><Question><![CDATA[Before <img alt="Map" src="map.png"> after. <img src="missing-map.png">]]></Question></Content>
    </SuperMemoElement>${card}</SuperMemoCollection>`;
  await loadSource(desktopApp, dialog, directory, xml);
  const media = dialog.getByText(/2 local image references|本地图片引用 2 处/);
  await expect(media).toBeVisible();
  await dialog.getByRole('button', { name: /^(Missing images 1|缺图 1)$/ }).click();
  await expect(dialog.getByText(/^(1 local image references cannot be imported|1 处本地图片引用无法导入)$/)).toBeVisible();
  await expect(dialog.getByText('missing-map.png', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(media).toBeHidden();
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  const sourceOption = dialog.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ });
  await sourceOption.click();
  await expect(sourceOption).toBeChecked();
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const activeDraft = await openPreview(desktopWindow);
  await expect(activeDraft.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ })).toBeChecked();
  await dialog.screenshot({ path: '.tmp/artifacts/T762/desktop/supermemo-parameters.png' });
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByText('collection.xml', { exact: true })).toBeVisible();
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
  const importedCard = await desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(snapshot.nodesById).find(node => node.title === 'Card');
  });
  expect(importedCard?.parentNodeId).toBe(nodeId);
  const cardDocument = await desktopWindow.evaluate(id => window.electronAPI!.invoke('load_node_document', { nodeId: id! }), importedCard?.id);
  expect(cardDocument?.content).toContain(`Source: [[node-id:${nodeId}|Imported map topic]]`);
  expect(cardDocument?.reveal).toBe('Answer');
  await desktopWindow.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id!), nodeId);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Before');
  const image = desktopWindow.getByRole('img', { name: 'Map', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(32);

});

test('updates the grade mapping in a live preview and remembers it when reopened', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('Grades');
  await loadSource(desktopApp, dialog, directory, secondExport);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  const planned = dialog.getByRole('row').filter({ hasText: '200+' }).getByRole('cell').last();
  const defaultDays = await planned.textContent();
  const good = /^(SuperMemo grade 4 · Good|SuperMemo 评分 4 · 良好)$/;
  const again = /^(SuperMemo grade 4 · Again|SuperMemo 评分 4 · 重来)$/;
  const trigger = dialog.getByRole('button', { name: good });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = desktopWindow.getByRole('menu');
  await expect(menu.getByRole('menuitemradio', { name: /^(Good|良好)$/ })).toBeChecked();
  await desktopWindow.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole('menuitemradio', { name: /^(Again|重来)$/ }).click();
  await expect(dialog.getByRole('button', { name: again })).toBeVisible();
  await expect(planned).not.toHaveText(defaultDays!);
  await dialog.screenshot({ path: testInfo.outputPath('supermemo-grade-mapping.png') });
  await desktopWindow.setViewportSize({ width: 780, height: 840 });
  await dialog.screenshot({ path: testInfo.outputPath('supermemo-parameters-narrow.png') });
  await desktopWindow.setViewportSize({ width: 1600, height: 1000 });
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();

  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('button', { name: again })).toBeVisible();
  await reopened.getByRole('button', { name: /^(Restore defaults|恢复默认)$/ }).click();
  await expect(reopened.getByRole('button', { name: good })).toBeVisible();
});
