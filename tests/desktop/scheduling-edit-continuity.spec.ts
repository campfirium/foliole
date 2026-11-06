import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T733/native');

async function seedScheduling(page: Page) {
  await page.evaluate(async () => {
    const at = new Date(Date.now() - 60_000).toISOString();
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: 'stable-scheduling', kind: 'topic',
      title: 'Stable scheduling', content: 'Original scheduling body', reading: {
        intervalDurationMs: 86400000, intervalGrowthFactor: 1.3, lastHandledAt: at, nextAt: at,
        priority: 5, readingPosition: 0, repetitionCount: 19, state: 'active'
      } }], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('stable-scheduling');
  });
}

async function observeLearningReads(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const { IPC_INVOKE_CHANNEL: channel } = require(`${process.cwd()}/dist/electron/ipc/contracts.js`);
    const state = { reads: 0 };
    Object.assign(globalThis, { schedulingContinuity: state });
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, request) => {
      if (request.command === 'load_node_learning') state.reads += 1;
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
}

async function postponeScheduling(page: Page) {
  await page.locator('[data-node-id="stable-scheduling"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Postpone topic...', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Postpone Topic' });
  await dialog.getByRole('slider').press('Home');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function prepareScheduling(desktopApp: ElectronApplication, page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await seedScheduling(page);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('stable-scheduling'));
}

test('keeps scheduling through saved text edits and updates a persisted postpone without changing material', async ({ desktopApp, desktopWindow: page }) => {
  await prepareScheduling(desktopApp, page);
  await page.locator('[data-panel-id="dev"]').click();
  const panel = page.locator('[data-panel-content-root="dev"]');
  await expect(panel.getByText('19', { exact: true })).toBeVisible();
  await observeLearningReads(desktopApp);
  await panel.evaluate(element => {
    const state = { empty: 0, samples: 0 };
    const observer = new MutationObserver(() => {
      state.samples += 1;
      if (!element.textContent?.includes('19')) state.empty += 1;
    });
    observer.observe(element, { childList: true, subtree: true });
    Object.assign(element, { continuity: { state, observer } });
  });
  const editor = page.getByRole('textbox', { name: 'Prompt editor', exact: true });
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
  await page.keyboard.insertText(' Saved body edit.');
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).focus();
  await expect.poll(() => page.evaluate(async () =>
    (await window.electronAPI.invoke('load_node_document', { nodeId: 'stable-scheduling' }))?.content))
    .toContain('Saved body edit.');
  await expect(panel.getByText('19', { exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const reads = await desktopApp.evaluate(() => Reflect.get(globalThis, 'schedulingContinuity').reads);
  const continuity = await panel.evaluate(element => {
    const value = Reflect.get(element, 'continuity');
    value.observer.disconnect();
    return value.state as { empty: number; samples: number };
  });
  expect(reads).toBe(0);
  expect(continuity.empty).toBe(0);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'scheduling-after-edit.png') });
  const facts = () => page.evaluate(async () => (await window.electronAPI.invoke('load_workspace_snapshot', {}))
    .nodesById['stable-scheduling']?.reading);
  const before = await facts();
  await postponeScheduling(page);
  await expect.poll(facts).not.toEqual(before);
  const after = await facts();
  const nextLabel = await page.evaluate(at => new Date(at!).toLocaleString('zh-CN', {
    hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }), after?.nextAt);
  await expect(panel.getByText(nextLabel, { exact: true })).toBeVisible();
  await runPaletteHistoryCommand(page, 'Undo Postpone Topic');
  await expect.poll(facts).toEqual(before);
  await page.screenshot({ path: path.join(output, 'scheduling-after-undo.png') });
  await page.locator('[data-panel-id="review-queue"]').click();
  const list = page.getByRole('list', { name: 'Flow items', exact: true });
  await expect(list.getByRole('button', { name: 'Stable scheduling', exact: true })).toBeVisible();
  await postponeScheduling(page);
  await expect(list.getByRole('button', { name: 'Stable scheduling', exact: true })).toHaveCount(0);
  fs.writeFileSync(path.join(output, 'scheduling.json'), JSON.stringify({ reads, continuity, before, after }, null, 2));
});
