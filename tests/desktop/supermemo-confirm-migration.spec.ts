import { rename } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { relaunchGoldenJourney } from './harness/core-product-golden-journey';
import { expect, test } from './harness/fixtures';
import { card, gradesStep, loadSource, openPreview, structureStep, parameters, superMemoImportComplete, openSuperMemoUpdateReview, superMemoUpdateComplete } from './harness/superMemoImport';

const convert = /^(Import|导入)$/;
const confirmUpdate = /^(Confirm Update|确认更新)$/;

function readImportedNodes(page: Page) {
  return page.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(nodesById).filter(node => ['Source article', 'Card', 'Empty card', 'New card'].includes(node.title))
      .map(({ id, title, parentNodeId }) => ({ id, title, parentNodeId })).sort((a, b) => a.title.localeCompare(b.title));
  });
}

test('shows settings before conversion and reports exceptions in the import result', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const directory = testInfo.outputPath('ConfirmFirst');
  const xml = `<SuperMemoCollection><Count>2</Count>${card}
    <SuperMemoElement><ID>3</ID><Type>Item</Type><Title>Empty card</Title></SuperMemoElement></SuperMemoCollection>`;
  await loadSource(desktopApp, dialog, directory, xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: gradesStep }).click();
  await expect(dialog.getByRole('heading', { name: gradesStep })).toBeVisible();
  await expect(dialog.getByText(/^(Conversion details|查看转换说明)$/)).toHaveCount(0);
  await expect(dialog.getByText(/^(1 to import|1 项可导入)/)).toHaveCount(0);
  await dialog.screenshot({ path: testInfo.outputPath('first-confirmation.png') });
  expect(await readImportedNodes(desktopWindow)).toEqual([]);
  await dialog.getByRole('button', { name: convert }).click();
  await expect(superMemoImportComplete(desktopWindow)).toBeVisible();
  await expect(dialog.getByRole('button', { name: convert })).toHaveCount(0);
  const written = await readImportedNodes(desktopWindow);
  expect(written.map(node => node.title)).toEqual(['Card']);
  const original = path.join(directory, 'ConfirmFirst.xml');
  const moved = path.join(directory, 'Moved.xml');
  await rename(original, moved);
  await superMemoImportComplete(desktopWindow).press('Escape');
  const reopened = await openPreview(desktopWindow);
  await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
  await expect(reopened.getByText(/[/\\]ConfirmFirst\.xml$/)).toBeVisible();
  await expect(reopened.getByRole('alert')).toHaveCount(0);
  await rename(moved, original);
  await reopened.getByRole('button', { name: structureStep }).click();
  await reopened.getByRole('button', { name: gradesStep }).click();
  await expect(reopened.getByRole('button', { name: /^(Update|更新)$/ })).toBeVisible();
  await expect(reopened.getByRole('textbox', { name: /^(Author import field name|Author 导入字段名)$/ })).toBeVisible();
  expect(await readImportedNodes(desktopWindow)).toEqual(written);
});

test('confirms a batch update once and reads its durable result after restarting', async ({ desktopSession, desktopWindow, desktopApp }, testInfo) => {
  const directory = testInfo.outputPath('ConfirmUpdate');
  const dialog = await openPreview(desktopWindow);
  const xml = `<SuperMemoCollection><Count>2</Count>
    <SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Source article</Title>
    <Content><Question>Article text</Question></Content></SuperMemoElement>${card}</SuperMemoCollection>`;
  await loadSource(desktopApp, dialog, directory, xml);
  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: convert }).click();
  await expect(superMemoImportComplete(desktopWindow)).toBeVisible();
  const [before, article] = await readImportedNodes(desktopWindow);
  expect(before?.parentNodeId).not.toBe(article?.id);
  await superMemoImportComplete(desktopWindow).press('Escape');

  const added = '<SuperMemoElement><ID>3</ID><Type>Item</Type><Title>New card</Title>' +
    '<Content><Question>A new question</Question><Answer>A new answer</Answer></Content></SuperMemoElement>';
  const reopened = await openPreview(desktopWindow);
  await loadSource(desktopApp, reopened, directory);
  await loadSource(desktopApp, reopened, directory,
    xml.replace('<Count>2</Count>', '<Count>3</Count>').replace('</SuperMemoCollection>', added + '</SuperMemoCollection>'),
    /^(Update XML|更新 XML)$/);
  const review = await openSuperMemoUpdateReview(reopened);
  await expect(review.getByText(/Matched 2 existing entries|已核实 2 条已有资料/)).toBeVisible();
  await review.screenshot({ path: testInfo.outputPath('update-confirmation.png') });
  expect(await readImportedNodes(desktopWindow)).toEqual([before, article]);
  await review.getByRole('button', { name: confirmUpdate }).click();
  await expect(superMemoUpdateComplete(desktopWindow).getByText(/Linked the newer export|已将新导出关联到原批次/)).toBeVisible();
  await expect(reopened.getByRole('button', { name: confirmUpdate })).toHaveCount(0);
  const written = await readImportedNodes(desktopWindow);
  expect(written.map(node => node.title)).toEqual(['Card', 'New card', 'Source article']);
  expect([written[0], written[2]]).toEqual([before, article]);
  await superMemoUpdateComplete(desktopWindow).press('Escape');

  const second = await relaunchGoldenJourney(desktopSession);
  try {
    const reloaded = await openPreview(second.firstWindow);
    await reloaded.getByRole('button', { name: structureStep }).click();
    const reviewed = await openSuperMemoUpdateReview(reloaded);
    await expect(reviewed.getByRole('button', { name: confirmUpdate })).toBeDisabled();
    expect(await readImportedNodes(second.firstWindow)).toEqual(written);
  } finally {
    await second.close();
  }
});
