import { rename } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { relaunchGoldenJourney } from './harness/core-product-golden-journey';
import { expect, test } from './harness/fixtures';
import { card, confirmStep, gradesStep, loadSource, openPreview, structureStep, parameters, sourceStep } from './harness/superMemoImport';

const convert = /^(Convert|转换)$/;
const confirmUpdate = /^(Confirm Update|确认更新)$/;
const close = /^(Close|关闭)$/;

function readImportedNodes(page: Page) {
  return page.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(nodesById).filter(node => ['Source article', 'Card', 'Empty card', 'New card'].includes(node.title))
      .map(({ id, title, parentNodeId }) => ({ id, title, parentNodeId })).sort((a, b) => a.title.localeCompare(b.title));
  });
}

test('reviews the current settings and actual exceptions before a first import', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('ConfirmFirst');
  const xml = `<SuperMemoCollection><Count>2</Count>${card}
    <SuperMemoElement><ID>3</ID><Type>Item</Type><Title>Empty card</Title></SuperMemoElement></SuperMemoCollection>`;
  await loadSource(desktopApp, dialog, directory, xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: sourceStep }).click();
  await dialog.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ }).click();
  await dialog.getByRole('button', { name: confirmStep }).click();
  await expect(dialog.getByRole('heading', { name: /^(Import a new batch|导入新批次)$/ })).toBeVisible();
  await expect(dialog.getByText(/^(100% toward Foliole|向 Foliole 调整 100%)$/)).toBeVisible();
  await expect(dialog.getByText(/^(End of each material’s content|所有材料的内容末尾)$/)).toBeVisible();
  await expect(dialog.getByText(/^(Empty cards to skip \(1\)|跳过空卡片（1 张）)$/)).toBeVisible();
  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: confirmStep }).click();
  await expect(dialog.getByText(/^(1 to import · 1 to skip|将导入 1 条 · 跳过 1 条)$/)).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('first-confirmation.png') });
  expect(await readImportedNodes(desktopWindow)).toEqual([]);
  await dialog.getByRole('button', { name: convert }).click();
  await expect(dialog.getByText(/^(Imported 1 · skipped 1|已导入 1 条 · 跳过 1 条)/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: convert })).toHaveCount(0);
  const written = await readImportedNodes(desktopWindow);
  expect(written.map(node => node.title)).toEqual(['Card']);
  const original = path.join(directory, 'ConfirmFirst.xml');
  const moved = path.join(directory, 'Moved.xml');
  await rename(original, moved);
  await dialog.getByRole('button', { name: close }).click();
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByText(/[/\\]ConfirmFirst\.xml$/)).toBeVisible();
  await expect(reopened.getByRole('alert')).toHaveCount(0);
  await rename(moved, original);
  await reopened.getByRole('button', { name: structureStep }).click();
  await reopened.getByRole('button', { name: confirmStep }).click();
  await expect(reopened.getByRole('heading', { name: /^(Update an existing batch|更新已有批次)$/ })).toBeVisible();
  await expect(reopened.getByRole('button', { name: convert })).toHaveCount(0);
  expect(await readImportedNodes(desktopWindow)).toEqual(written);
});

test('confirms a batch update once and reads its durable result after restarting', async ({ desktopSession, desktopWindow, desktopApp }, testInfo) => {
  const directory = testInfo.outputPath('ConfirmUpdate');
  const dialog = await openPreview(desktopWindow);
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Source article</Title>
    <Content><Question>Article text</Question></Content></SuperMemoElement>${card}</SuperMemoCollection>`;
  await loadSource(desktopApp, dialog, directory, xml);
  await dialog.getByRole('button', { name: confirmStep }).click();
  await dialog.getByRole('button', { name: convert }).click();
  await expect(dialog.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  const [before, article] = await readImportedNodes(desktopWindow);
  expect(before?.parentNodeId).not.toBe(article?.id);
  await dialog.getByRole('button', { name: close }).click();

  const newer = testInfo.outputPath('ConfirmNewExport');
  const added = '<SuperMemoElement><ID>3</ID><Type>Item</Type><Title>New card</Title>' +
    '<Content><Question>A new question</Question><Answer>A new answer</Answer></Content></SuperMemoElement>';
  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, directory);
  await loadSource(desktopApp, reopened, newer,
    xml.replace('<Count>2</Count>', '<Count>3</Count>').replace('</SuperMemoCollection>', added + '</SuperMemoCollection>'),
    /^(Choose newer XML|Load newer export|选择新版 XML|载入重新导出的 XML)$/);
  await expect(reopened.getByText(/^(Use the ratio saved for this batch|沿用该批次保存的比例)$/)).toBeVisible();
  await expect(reopened.getByText(/Matched 2 existing entries|已核实 2 条已有资料/)).toBeVisible();
  await reopened.screenshot({ path: testInfo.outputPath('update-confirmation.png') });
  expect(await readImportedNodes(desktopWindow)).toEqual([before, article]);
  await reopened.getByRole('button', { name: confirmUpdate }).click();
  await expect(reopened.getByText(/Linked the newer export|已将新导出关联到原批次/)).toBeVisible();
  await expect(reopened.getByRole('button', { name: confirmUpdate })).toHaveCount(0);
  const written = await readImportedNodes(desktopWindow);
  expect(written.map(node => node.title)).toEqual(['Card', 'New card', 'Source article']);
  expect([written[0], written[2]]).toEqual([before, article]);
  await reopened.getByRole('button', { name: close }).click();

  const second = await relaunchGoldenJourney(desktopSession);
  try {
    const reloaded = await openPreview(second.firstWindow);
    await reloaded.getByRole('button', { name: structureStep }).click();
    await reloaded.getByRole('button', { name: confirmStep }).click();
    await expect(reloaded.getByRole('button', { name: confirmUpdate })).toBeDisabled();
    expect(await readImportedNodes(second.firstWindow)).toEqual(written);
  } finally {
    await second.close();
  }
});
