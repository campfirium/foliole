import { rm } from 'node:fs/promises';

import type { ElectronApplication, Page } from '@playwright/test';

import { exitFlowIfNeeded, relaunchGoldenJourney } from './harness/core-product-golden-journey';
import { type DesktopSession, expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { loadSource, openPreview, parameters } from './harness/superMemoImport';

const xml = process.env.FOLIOLE_SUPERMEMO_VALIDATION_XML;

function readWorkspace(page: Page) {
  return page.evaluate(async () => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById);
}

function readImportedIds(app: ElectronApplication) {
  return app.evaluate(({ app }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${app.getAppPath()}/database/connection.js`);
    return runWithDatabaseConnectionOwner(() => {
      const rows = openDatabaseConnection().sqlite.prepare(
        "SELECT value FROM workspace_meta WHERE key GLOB 'supermemo-import:*'"
      ).pluck().all() as string[];
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new Error(`Expected one import batch, found ${rows.length}`);
      const batch = JSON.parse(rows[0]!) as { entries: { id: number; nodeId: string | null }[] };
      return Object.fromEntries(batch.entries.flatMap(entry => entry.nodeId ? [[entry.id, entry.nodeId]] : []));
    });
  }) as Promise<Record<number, string> | null>;
}

function expectImportedHierarchy(nodes: Awaited<ReturnType<typeof readWorkspace>>, ids: Record<number, string>) {
  const root = Object.values(nodes).filter(node => node.kind === 'folder' && node.title === 'SuperMemo' && node.parentNodeId === null);
  expect(root).toHaveLength(1);
  expect(nodes[ids[56]!]?.parentNodeId).toBe(root[0]!.id);
  expect(nodes[ids[3517]!]).toMatchObject({ parentNodeId: ids[825], anchorLink: { kind: 'highlight' } });
  expect(nodes[ids[1148]!]?.parentNodeId).toBe(ids[3302]);
  expect(nodes[ids[797]!]).toMatchObject({ parentNodeId: ids[1148], anchorLink: { kind: 'cloze' } });
  expect(nodes[ids[75]!]?.reading?.state).toBe('dismissed');
}

async function clearStarterTopics(page: Page) {
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
  });
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Object.values(snapshot.nodesById).filter(node => ['topic', 'item'].includes(node.kind)
      && !snapshot.trashedNodeIds.includes(node.id)).length;
  })).toBe(0);
}

async function importLearning(page: Page, app: ElectronApplication, outputPath: (name: string) => string) {
  const before = Object.keys(await readWorkspace(page));
  expect(await readImportedIds(app)).toBeNull();
  const dialog = await openPreview(page);
  await app.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  }, xml!);
  await dialog.getByRole('button', { name: /^(Load XML|载入 XML)$/ }).click();
  await expect(dialog.getByRole('button', { name: /^(Missing images|缺图) 243$/ })).toBeVisible({ timeout: 90_000 });
  const tree = dialog.getByRole('region', { name: /^(Entries|条目)$/ });
  await expect(tree.getByText('SuperMemo', { exact: true })).toBeVisible();
  await dialog.screenshot({ path: outputPath('learning-preview.png') });
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByText(/Candidate dates and priority order come from the paired collection|候选日期和优先顺序来自配对资料库/)).toBeVisible();
  expect(Object.keys(await readWorkspace(page))).toEqual(before);
  expect(await readImportedIds(app)).toBeNull();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/Imported 3434 · skipped 17 · 243 unresolved image references|已导入 3434 条 · 跳过 17 条 · 未找到图片 243 处/))
    .toBeVisible({ timeout: 120_000 });
  await dialog.screenshot({ path: outputPath('learning-import-result.png') });
  const ids = await readImportedIds(app);
  if (!ids) throw new Error('Missing committed Learning batch');
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await page.keyboard.press('Escape');
  return ids;

}

async function gradeFirstImportedCard(page: Page, importedIds: Set<string>) {
  await exitFlowIfNeeded(page);
  await page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click({ timeout: 10_000 });
  const reveal = page.getByRole('button', { name: /^(Show Answer|Reveal Answer|显示答案)$/ });
  const read = page.getByRole('button', { name: 'Read', exact: true });
  for (let readCount = 0; readCount < 20; readCount += 1) {
    await expect(reveal.or(read).first()).toBeVisible();
    if (await reveal.isVisible()) break;
    await read.click();
  }
  await expect(reveal).toBeVisible();
  const id = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
  expect(importedIds.has(id!)).toBe(true);
  const before = (await readWorkspace(page))[id!]?.review;
  await reveal.click();
  await page.getByRole('button', { name: /^(Good|良好)$/ }).click();
  await expect.poll(async () => (await readWorkspace(page))[id!]?.review?.reps).toBe((before?.reps ?? 0) + 1);
  return { id: id!, review: (await readWorkspace(page))[id!]?.review };
}

async function restoreAndAdjustLearning(page: Page, app: ElectronApplication, sourcePath: string,
  ids: Record<number, string>, before: Awaited<ReturnType<typeof readWorkspace>>, gradedId: string) {
  await page.evaluate(path => window.electronAPI.invoke('restore_sqlite_database', { sourcePath: path }), sourcePath);
  expect(await readImportedIds(app)).toEqual(ids);
  const restored = await readWorkspace(page);
  expectImportedHierarchy(restored, ids);
  expect(restored[gradedId]?.review).toEqual(before[gradedId]?.review);
  const changed = await page.evaluate(async () => {
    const api = window.electronAPI;
    const [batch] = await api.invoke('list_supermemo_imports');
    if (!batch) throw new Error('Restored Learning batch is missing');
    return api.invoke('adjust_supermemo_import', { batchId: batch.batchId, percent: 100 });
  });
  expect(changed.updated).toBeGreaterThan(0);
  const adjusted = await readWorkspace(page);
  expect(Object.keys(adjusted)).toEqual(Object.keys(restored));
  expect(Object.values(ids).some(id => adjusted[id]?.review?.due !== restored[id]?.review?.due)).toBe(true);
}

test('imports paired Learning, studies, relaunches, and restores the saved batch', async ({ desktopSession }, testInfo) => {
  // SKIP: requires the private paired Learning export | 2026-11-17 | revive: supply the XML path with adjacent collection
  test.skip(!xml, 'Learning export is required');
  test.setTimeout(240_000);
  const { firstWindow: page, electronApp: app } = desktopSession;
  await clearStarterTopics(page);
  const ids = await importLearning(page, app, name => testInfo.outputPath(name));
  const imported = await readWorkspace(page);
  expectImportedHierarchy(imported, ids);
  const backupPath = testInfo.outputPath('learning-before-first-score.db');
  let relaunched: DesktopSession | undefined;
  try {
    await page.evaluate(destinationPath => window.electronAPI.invoke('backup_sqlite_database', { destinationPath }), backupPath);
    const graded = await gradeFirstImportedCard(page, new Set(Object.values(ids)));
    relaunched = await relaunchGoldenJourney(desktopSession);
    await expectWorkspaceShell(relaunched.firstWindow);
    expect(await readImportedIds(relaunched.electronApp)).toEqual(ids);
    const restarted = await readWorkspace(relaunched.firstWindow);
    expectImportedHierarchy(restarted, ids);
    expect(restarted[graded.id]?.review).toEqual(graded.review);
    await restoreAndAdjustLearning(relaunched.firstWindow, relaunched.electronApp, backupPath, ids, imported, graded.id);
  } finally {
    await rm(backupPath, { force: true });
    await relaunched?.close();
  }
});

test('makes an imported due card available in an already prepared empty Flow', async ({ desktopWindow: page, desktopApp: app }, testInfo) => {
  await clearStarterTopics(page);
  await exitFlowIfNeeded(page);
  await expect(page.getByRole('button', { name: /^(Review queue empty|复习队列为空)$/ })).toBeVisible();
  const dialog = await openPreview(page);
  const source = `<SuperMemoCollection><Count>1</Count>
    <SuperMemoElement><ID>1</ID><Type>Item</Type><Title>Due imported card</Title>
      <Content><Question>Imported question</Question><Answer>Imported answer</Answer></Content>
      <LearningData><LastRepetition>10.11.2025</LastRepetition><Interval>1</Interval></LearningData>
    </SuperMemoElement></SuperMemoCollection>`;
  await loadSource(app, dialog, testInfo.outputPath('due-card'), source);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/^(Imported 1|已导入 1 条)/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await page.keyboard.press('Escape');
  const ids = await readImportedIds(app);
  const graded = await gradeFirstImportedCard(page, new Set(Object.values(ids ?? {})));
  expect(graded.id).toBe(ids?.[1]);
});
