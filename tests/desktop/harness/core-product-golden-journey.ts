import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Page, TestInfo } from '@playwright/test';

import { closeDesktopApplication } from '../../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, type DesktopSession } from './fixtures';
import { getSettingsDialog, openSettingsCategory, openSettingsDialog } from './settings';

export const GOLDEN_TITLE = 'Mac Core Golden Journey';
export const GOLDEN_NEEDLE = `MacCoreGoldenNeedle-${Date.now()}`;
export const GOLDEN_CONTENT = [
  `# ${GOLDEN_TITLE}`,
  '',
  ...Array.from({ length: 180 }, (_, index) => (
    index === 142
      ? `Deep reading paragraph contains ${GOLDEN_NEEDLE} for workspace search verification.`
      : `Reading line ${index + 1} keeps this product journey long enough to restore position.`
  ))
].join('\n');

const GUIDED_TITLE = /^(Reading: Break the Whole into Pieces|阅读：化整为零)$/;
const WELCOME_TITLE = /^(Welcome to Foliole|欢迎使用 Foliole)$/;
const WORKSPACE_NAME = /^(Foliole workspace|Foliole 工作区)$/;

type ReadingState = { nextAt: string; state: string } | null;
type RuntimeRootSession = DesktopSession & {
  target: DesktopSession['target'] & { runtimeStateRoot: string };
};

async function dismissSearchEnhancementPrompt(page: Page) {
  const prompt = page.getByRole('dialog', {
    name: /(Use Chinese, Japanese, or Korean search\?|使用中文、日文或韩文搜索？|Turn on search enhancement for languages without spaces|要为无空格语言开启搜索增强)/
  });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: /(Not now|暂不)/ }).click();
  await expect(prompt).toBeHidden();
}

export async function prepareGoldenJourneyWindow(session: DesktopSession) {
  await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
  if (process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN !== '1') {
    const target = await session.electronApp.browserWindow(session.firstWindow);
    await target.evaluate((window) => {
      window.setBounds({ width: 1600, height: 1000, x: 80, y: 80 });
      window.show();
      window.setAlwaysOnTop(true);
      window.focus();
      window.webContents.focus();
      window.setAlwaysOnTop(false);
    });
    await expect.poll(() => target.evaluate((window) => window.isVisible())).toBe(true);
    await expect.poll(() => target.evaluate((window) => window.isFocused())).toBe(true);
  }
}

export async function createGoldenTopic(page: Page) {
  const beforeId = await page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => page.evaluate((previousId) => {
    const activeId = window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    return activeId && activeId !== previousId ? activeId : null;
  }, beforeId)).not.toBeNull();
  const nodeId = await page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  expect(nodeId).toBeTruthy();
  await expect.poll(() => page.evaluate(() => (
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0) ?? false
  ))).toBe(true);
  await page.locator('.prompt-editor-host .cm-content').click();
  await page.keyboard.insertText(GOLDEN_CONTENT);
  await expect.poll(() => page.evaluate((id) => (
    window.__folioleWorkspaceDebug?.getNode?.(id)?.content ?? null
  ), nodeId)).toBe(GOLDEN_CONTENT);
  await expect(page.getByRole('treeitem', { name: GOLDEN_TITLE, exact: true })).toBeVisible();
  return nodeId!;
}

export async function openGuidedSample(page: Page) {
  const guided = page.getByRole('treeitem', { name: GUIDED_TITLE });
  if (!(await guided.isVisible().catch(() => false))) {
    const welcome = page.getByRole('treeitem', { name: WELCOME_TITLE });
    await welcome.click();
    await welcome.press('ArrowRight');
  }
  await guided.click();
  const workspace = page.getByRole('main', { name: WORKSPACE_NAME });
  const expectedContent = await page.evaluate(async () => {
    const id = window.__folioleWorkspaceDebug!.getActiveNodeId()!;
    return (await window.electronAPI!.invoke('load_node_document', { nodeId: id }))!.content;
  });
  expect(expectedContent.length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
    .toBe(expectedContent);
  await expect(workspace).not.toContainText(GOLDEN_NEEDLE);
}

export async function openGoldenTopic(page: Page, nodeId: string) {
  await page.getByRole('treeitem', { name: GOLDEN_TITLE, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  ))).toBe(nodeId);
  await expect(page.getByRole('main', { name: WORKSPACE_NAME }))
    .toContainText('Reading line 180 keeps this product journey long enough to restore position.');
  await expect.poll(() => page.evaluate(() => (
    window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
  ))).toBe(GOLDEN_CONTENT);
}

export async function searchGoldenTopic(page: Page, nodeId: string) {
  await expect.poll(() => page.evaluate(async ({ id, needle }) => {
    const results = await window.electronAPI?.invoke('search_workspace', { query: needle });
    return results?.results.find((result: { id?: string; nodeMatch?: unknown }) => result.id === id)?.nodeMatch ?? null;
  }, { id: nodeId, needle: GOLDEN_NEEDLE }), { timeout: 15_000 }).not.toBeNull();
  const promptExpected = await page.evaluate(() => (
    window.localStorage.getItem('foliole-search-enhancement-prompt-dismissed') !== 'true'
  ));
  const searchButton = page.getByRole('button', { name: /^(Search|搜索)$/ });
  await searchButton.click();
  const dialog = page.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  if (promptExpected) {
    await dismissSearchEnhancementPrompt(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await searchButton.click();
  }
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill(GOLDEN_NEEDLE);
  await dialog.getByRole('button', { name: new RegExp(GOLDEN_TITLE) }).click();
  await expect.poll(() => page.evaluate(() => {
    const selection = window.__folioleDebug?.getEditorSelection?.('prompt-editor') ?? null;
    const content = window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? '';
    return selection ? content.slice(selection.from, selection.to) : '';
  })).toBe(GOLDEN_NEEDLE);
}

export async function scrollGoldenTopic(page: Page, nodeId: string) {
  const scroller = page.locator('.prompt-editor-host .cm-scroller');
  await scroller.hover();
  await page.mouse.wheel(0, 9000);
  await expect.poll(() => page.evaluate((id) => (
    window.__folioleWorkspaceDebug?.getNodeViewState?.(id)?.scrollTop ?? 0
  ), nodeId)).toBeGreaterThan(0);
  return collectGoldenState(page, nodeId);
}

export async function readCurrentFlowTopic(page: Page) {
  const enterFlow = page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ });
  const read = page.getByRole('button', { name: 'Read', exact: true });
  await expect.poll(async () => await read.isVisible() || await enterFlow.isVisible()).toBe(true);
  if (await enterFlow.isVisible().catch(() => false)) await enterFlow.click();
  await expect(read).toBeVisible();
  const nodeId = await page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  expect(nodeId).toBeTruthy();
  const before = await readGoldenReading(page, nodeId!);
  await read.click();
  await expect.poll(() => readGoldenReading(page, nodeId!)).not.toEqual(before);
  const reading = await readGoldenReading(page, nodeId!);
  expect(reading).toMatchObject({ nextAt: expect.any(String), state: expect.any(String) });
  return { nodeId: nodeId!, reading: reading as ReadingState };
}

export async function readGoldenReading(page: Page, nodeId: string) {
  return page.evaluate(async (id) => {
    const snapshot = await window.electronAPI!.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    if (!snapshot.libraryScope) throw new Error('golden_library_scope_missing');
    const learning = await window.electronAPI!.invoke('load_node_learning', {
      nodeIds: [id], libraryScope: snapshot.libraryScope
    });
    return learning.find((node) => node.nodeId === id)?.reading ?? null;
  }, nodeId);
}

export async function exitFlowIfNeeded(page: Page) {
  const exit = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exit.isVisible().catch(() => false)) await exit.click();
}

export async function chooseDarkAppearance(page: Page) {
  const dialog = await openSettingsCategory(page, 'Appearance');
  const radio = dialog.getByRole('radiogroup', { name: /^(Mode|模式)$/ })
    .getByRole('radio', { name: /^(Dark|深色)$/ });
  await radio.click();
  await expect(radio).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.resolvedBaseColor)).toBe('dark');
  await page.keyboard.press('Escape');
  await expect(getSettingsDialog(page)).toBeHidden();
}

export async function expectDarkAppearance(page: Page) {
  const dialog = await openSettingsDialog(page);
  await expect.poll(async () => {
    const labels = await dialog.getByRole('button').allTextContents();
    return { hasAppearance: labels.some((label) => /^(Appearance|外观)$/.test(label.trim())), labels };
  }).toMatchObject({ hasAppearance: true });
  await dialog.getByRole('button', { name: /^(Appearance|外观)$/ }).click();
  await expect(dialog.getByRole('radiogroup', { name: /^(Mode|模式)$/ })
    .getByRole('radio', { name: /^(Dark|深色)$/ })).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.resolvedBaseColor)).toBe('dark');
  await page.keyboard.press('Escape');
}

export async function collectGoldenState(page: Page, nodeId: string) {
  const reading = await readGoldenReading(page, nodeId);
  return page.evaluate(({ id, reading }) => {
    const api = window.__folioleWorkspaceDebug;
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      reading,
      resolvedBaseColor: document.documentElement.dataset.resolvedBaseColor ?? null,
      scrollTop: scroller?.scrollTop ?? null,
      viewState: api?.getNodeViewState?.(id) ?? null
    };
  }, { id: nodeId, reading });
}

export async function relaunchGoldenJourney(session: DesktopSession) {
  const stateRoot = (session as RuntimeRootSession).target.runtimeStateRoot;
  expect(stateRoot).toBeTruthy();
  await closeDesktopApplication(session.electronApp);
  const second = await launchDesktopSession({
    env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
  }) as DesktopSession;
  await prepareGoldenJourneyWindow(second);
  return second;
}

export async function attachGoldenEvidence(page: Page, testInfo: TestInfo, name: string, state: unknown) {
  const mode = process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1' ? 'hidden' : 'visible';
  const outputDir = path.resolve('.tmp/artifacts/desktop-acceptance');
  const screenshotPath = path.join(outputDir, `${name}-${mode}.png`);
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach(`${name}-${mode}-state`, {
    body: JSON.stringify(state, null, 2), contentType: 'application/json'
  });
  await testInfo.attach(`${name}-${mode}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png'
  });
}
