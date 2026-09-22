import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/t244-reading-feedback');
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

for (const entry of ['keyboard', 'button'] as const) {
test(`${entry} reports save failure and retries without advancing twice`, async ({ desktopApp, desktopWindow }) => {
  fs.mkdirSync(output, { recursive: true });
  await prepareReading(desktopWindow);
  await installSaveProbe(desktopApp);
  const before = await readState(desktopWindow);
  expect(before.queue).toHaveLength(2);
  expect(before.readTopicCount).toBe(0);
  const read = desktopWindow.getByRole('button', { name: /^Read$/ });
  if (entry === 'keyboard') {
    await read.focus();
    await desktopWindow.keyboard.press('f');
  } else {
    await read.click();
  }
  await expectFailed(desktopWindow, before);
  expect(await saveCalls(desktopApp)).toBe(1);
  await desktopWindow.screenshot({ path: path.join(output, `${entry}-failed.png`) });
  await desktopWindow.getByRole('button', { name: /^Retry$/ }).click();
  await expect.poll(() => saveCalls(desktopApp)).toBe(2);
  await expect(read).toBeDisabled();
  await desktopWindow.keyboard.press('f');
  await desktopWindow.keyboard.press('f');
  expect(await saveCalls(desktopApp)).toBe(2);
  expect(await readState(desktopWindow)).toEqual(before);
  await desktopApp.evaluate(() => (globalThis as ProbeGlobal).readingSaveProbe.release?.());
  await expect(desktopWindow.getByRole('button', { name: /^Retry$/ })).toHaveCount(0);
  await expect.poll(async () => (await readState(desktopWindow)).readTopicCount).toBe(1);
  const after = await readState(desktopWindow);
  expect(after.queue).toHaveLength(1);
  expect(after.currentNodeId).not.toBe(before.currentNodeId);
  expect(await saveCalls(desktopApp)).toBe(2);
  await desktopWindow.screenshot({ path: path.join(output, `${entry}-retry-restored.png`) });
  fs.writeFileSync(path.join(output, `${entry}-native-result.json`), JSON.stringify({ before, after, saveCalls: 2 }, null, 2));
});
}
