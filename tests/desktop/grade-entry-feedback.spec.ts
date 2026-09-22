import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/f2-grade-entry-repair/native');
const labels = ['Again', 'Hard', 'Good', 'Easy'] as const;
type Probe = { calls: unknown[]; release?: () => void };
type Globals = typeof globalThis & { gradeSaveProbe: Probe };

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b'].map((id) => ({
      id: `grade-failure-${id}`, kind: 'item', title: `Grade ${id}`, content: `Question ${id}`, reveal: `Answer ${id}`,
      review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    })), { persist: true });
  });
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await expect(page.getByRole('button', { name: /^Good$/ })).toBeVisible();
}

async function installProbe(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const probe: Probe = { calls: [] };
    (globalThis as Globals).gradeSaveProbe = probe;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      if (request.command === 'apply_review_grade') {
        probe.calls.push(request.args);
        if (probe.calls.length === 1) throw new Error('grade_save_failure_test');
        await new Promise<void>((resolve) => { probe.release = resolve; });
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    const session = api.getReviewSession!();
    const disk = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return { session, a: api.getNode('grade-failure-a')?.review, b: api.getNode('grade-failure-b')?.review,
      diskA: disk.nodesById['grade-failure-a']?.review, diskB: disk.nodesById['grade-failure-b']?.review };
  });
}

async function calls(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as Globals).gradeSaveProbe.calls);
}

async function nativeGrade(app: ElectronApplication, label: string) {
  await app.evaluate(({ Menu, BrowserWindow }, name) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(`review.grade${name}`);
    if (!item?.enabled) throw new Error(`native grade disabled: ${name}`);
    item.click(item, BrowserWindow.getAllWindows()[0], {} as never);
  }, label);
}

async function trigger(page: Page, app: ElectronApplication, entry: string, label: string, grade: number) {
  if (entry === 'native-callback') return nativeGrade(app, label);
  if (entry === 'button') return page.getByRole('button', { name: label, exact: true }).click();
  if (entry === 'keyboard') {
    await page.getByRole('button', { name: /^Good$/ }).focus();
    return page.keyboard.press(String(grade));
  }
  await page.keyboard.press('Meta+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByRole('textbox', { name: 'Search commands' }).fill(`Grade Review: ${label}`);
  await dialog.getByRole('button', { name: `Grade Review: ${label}`, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function retryOnce(page: Page, app: ElectronApplication, before: Awaited<ReturnType<typeof state>>) {
  await page.getByRole('button', { name: /^Retry$/ }).click();
  await expect.poll(async () => (await calls(app)).length).toBe(2);
  for (const name of labels) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await page.keyboard.press('1');
  await page.keyboard.press('4');
  expect(await state(page)).toEqual(before);
  expect(await calls(app)).toHaveLength(2);
  await app.evaluate(() => (globalThis as Globals).gradeSaveProbe.release?.());
  await expect(page.getByRole('button', { name: /^Retry$/ })).toHaveCount(0);
  await expect.poll(async () => (await state(page)).session.currentNodeId).not.toBe(before.session.currentNodeId);
}

for (const [index, label] of labels.entries()) {
  for (const entry of ['button', 'keyboard', 'palette', 'native-callback']) {
    test(`${label} ${entry} retries its failed grade once and survives reload`, async ({ desktopApp: app, desktopWindow: page }) => {
      fs.mkdirSync(output, { recursive: true });
      await prepare(page);
      await installProbe(app);
      const before = await state(page);
      await trigger(page, app, entry, label, index + 1);
      await expect(page.getByText('Failed to save grade. Please retry.')).toBeVisible();
      await expect(page.getByRole('button', { name: /^Retry$/ })).toBeEnabled();
      expect(await state(page)).toEqual(before);
      expect(await calls(app)).toHaveLength(1);
      await page.screenshot({ path: path.join(output, `${label}-${entry}-failed.png`) });
      await retryOnce(page, app, before);
      const after = await state(page);
      const targetA = before.session.currentNodeId === 'grade-failure-a';
      expect(targetA ? after.diskB : after.diskA).toEqual(targetA ? before.diskB : before.diskA);
      expect(targetA ? after.diskA?.reps : after.diskB?.reps).toBe(1);
      expect(after.a).toEqual(after.diskA);
      expect(after.b).toEqual(after.diskB);
      const requests = await calls(app);
      expect(requests).toHaveLength(2);
      for (const request of requests) expect(request).toMatchObject({ nodeId: before.session.currentNodeId, grade: index + 1 });
      await page.screenshot({ path: path.join(output, `${label}-${entry}-restored.png`) });
      await page.reload();
      await expectWorkspaceShell(page);
      await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getNode('grade-failure-a')?.review)).toEqual(after.diskA);
      await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getNode('grade-failure-b')?.review)).toEqual(after.diskB);
      fs.writeFileSync(path.join(output, `${label}-${entry}-result.json`), JSON.stringify({ before, after, requests, hydrated: true }, null, 2));
    });
  }
}
