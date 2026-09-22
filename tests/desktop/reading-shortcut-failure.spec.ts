import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/f1-reading-entry-repair/native');
type SaveProbe = { calls: number; release?: () => void };
type ProbeGlobal = typeof globalThis & { readingSaveProbe: SaveProbe };

async function prepareReading(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id: 'reading-failure-a', kind: 'topic', title: 'Reading A', content: 'Reading body A' },
      { id: 'reading-failure-b', kind: 'topic', title: 'Reading B', content: 'Reading body B' }
    ], { persist: true });
  });
  await page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click();
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeVisible();
}

async function installSaveProbe(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const probe: SaveProbe = { calls: 0 };
    (globalThis as ProbeGlobal).readingSaveProbe = probe;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      if (request.command === 'save_node_reading_state') {
        probe.calls += 1;
        if (probe.calls === 1) throw new Error('reading_save_failure_test');
        await new Promise<void>((resolve) => { probe.release = resolve; });
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const session = window.__folioleWorkspaceDebug?.getReviewSession?.();
    return {
      currentNodeId: session?.currentNodeId,
      queue: session?.queueNodeIds,
      readTopicCount: session?.readTopicCount,
      reading: session?.currentNodeId ? window.__folioleWorkspaceDebug?.getNode?.(session.currentNodeId)?.reading : null
    };
  });
}

async function saveCalls(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as ProbeGlobal).readingSaveProbe.calls);
}

async function expectFailed(page: Page, before: Awaited<ReturnType<typeof readState>>) {
  await expect(page.getByText('Failed to save. Please retry.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Retry$/ })).toBeEnabled();
  expect(await readState(page)).toEqual(before);
}

async function triggerReading(page: Page, entry: string, label: string, key: string) {
  if (entry === 'palette') {
    await page.keyboard.press('Meta+Shift+P');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Search commands' }).fill(`Reading: ${label}`);
    await dialog.getByRole('button', { name: `Reading: ${label}`, exact: true }).click();
    await expect(dialog).toBeHidden();
  } else if (entry === 'keyboard') {
    await page.getByRole('button', { name: /^Read$/ }).focus();
    await page.keyboard.press(key);
  } else {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
}

async function persistedReading(page: Page, nodeId: string) {
  return page.evaluate(async (id) =>
    (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id]?.reading, nodeId);
}

for (const [label, key] of [['Read', 'f'], ['Later', '2'], ['Dismiss', '4']] as const) {
for (const entry of ['keyboard', 'button', 'palette'] as const) {
test(`${label} ${entry} reports failure and retries once through persistence and reload`, async ({ desktopApp, desktopWindow }) => {
  fs.mkdirSync(output, { recursive: true });
  await prepareReading(desktopWindow);
  await installSaveProbe(desktopApp);
  const before = await readState(desktopWindow);
  const nodeId = before.currentNodeId!;
  const otherId = nodeId === 'reading-failure-a' ? 'reading-failure-b' : 'reading-failure-a';
  const diskBefore = await persistedReading(desktopWindow, nodeId);
  const otherBefore = await persistedReading(desktopWindow, otherId);
  expect(before.queue).toHaveLength(2);
  expect(before.readTopicCount).toBe(0);
  await triggerReading(desktopWindow, entry, label, key);
  await expectFailed(desktopWindow, before);
  expect(await persistedReading(desktopWindow, nodeId)).toEqual(diskBefore);
  expect(await saveCalls(desktopApp)).toBe(1);
  await desktopWindow.screenshot({ path: path.join(output, `${label}-${entry}-failed.png`) });
  await desktopWindow.getByRole('button', { name: /^Retry$/ }).click();
  await expect.poll(() => saveCalls(desktopApp)).toBe(2);
  await expect(desktopWindow.getByRole('button', { name: /^Read$/ })).toBeDisabled();
  await desktopWindow.keyboard.press(key);
  await desktopWindow.keyboard.press('f');
  expect(await saveCalls(desktopApp)).toBe(2);
  expect(await readState(desktopWindow)).toEqual(before);
  await desktopApp.evaluate(() => (globalThis as ProbeGlobal).readingSaveProbe.release?.());
  await expect(desktopWindow.getByRole('button', { name: /^Retry$/ })).toHaveCount(0);
  await expect.poll(async () => (await readState(desktopWindow)).readTopicCount).toBe(1);
  const after = await readState(desktopWindow);
  expect(after.queue).toHaveLength(1);
  expect(after.currentNodeId).not.toBe(nodeId);
  expect(await saveCalls(desktopApp)).toBe(2);
  const diskAfter = await persistedReading(desktopWindow, nodeId);
  expect(diskAfter).not.toEqual(diskBefore);
  expect(await persistedReading(desktopWindow, otherId)).toEqual(otherBefore);
  await desktopWindow.screenshot({ path: path.join(output, `${label}-${entry}-restored.png`) });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect.poll(() => desktopWindow.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNode(id)?.reading, nodeId)).toEqual(diskAfter);
  fs.writeFileSync(path.join(output, `${label}-${entry}-result.json`), JSON.stringify({
    before, after, nodeId, diskBefore, diskAfter, otherBefore, saveCalls: 2, hydrated: true
  }, null, 2));
});
}
}
