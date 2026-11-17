import fs from 'node:fs';

import type { ElectronApplication, Page } from '@playwright/test';

import { assistantReadyStatus, openAssistantPanel } from './assistant-panel-home-detail.support';
import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const articleIds = ['aide-link-first', 'aide-link-second'];
const flowNode = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);

async function useControlledReply(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }, status) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const index = require(`${process.cwd()}/dist/electron/database/assistantThreadIndex.js`);
    const state = globalThis as typeof globalThis & {
      releaseAideMaterialReply?: () => void;
      aideMaterialContext?: unknown;
    };
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      if (request.command === 'assistant_get_status') return status;
      if (request.command === 'assistant_send_message') {
        state.aideMaterialContext = { message: request.args.message, ...request.args.workspaceContext };
        return new Promise(resolve => {
          state.releaseAideMaterialReply = () => {
            const threadIndex = index.upsertAssistantThreadIndex({
              provider: 'codex-app-server', providerThreadId: 'material-link-thread',
              location: request.args.openingLocation, message: request.args.message
            });
            resolve({
              state: 'ready', provider: 'codex-app-server', threadIndex,
              message: { text: 'A shorter opening.', threadId: 'material-link-thread', turnId: 'turn-link' }
            });
          };
        });
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  }, assistantReadyStatus);
}

async function prepare(page: Page, app: ElectronApplication, ids = articleIds) {
  await expectWorkspaceShell(page);
  await page.evaluate(async ids => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-aide-enabled', 'true');
    const workspace = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await workspace.deleteNode(node.id);
    }
    await workspace.seedNodes(ids.map(id => ({
      id, kind: 'topic', title: id, content: 'Body for ' + id
    })), { persist: true });
  }, ids);
  await resetDailyFlowGeneration(app);
  await useControlledReply(app);
  await page.reload();
  await expectWorkspaceShell(page);
}

test('returns to an Aide conversation material while preserving Flow progress', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(page, desktopApp);
  const enter = page.getByRole('button', { name: 'Enter Flow', exact: true });
  const exit = page.getByRole('button', { name: 'Exit Flow', exact: true });
  await enter.click();
  const read = page.getByRole('button', { name: 'Read', exact: true });
  await expect(read).toBeEnabled();
  const first = await flowNode(page);
  expect(articleIds).toContain(first);
  const next = articleIds.find(id => id !== first);
  await exit.click();
  await openAssistantPanel(page);
  const aide = page.locator('[data-panel-content-root="assistant"]');
  await aide.getByRole('textbox', { name: 'Foliole Aide message' }).fill('Shorten the opening');
  await aide.getByRole('button', { name: 'Send', exact: true }).click();
  await enter.click();
  await read.click();
  await expect.poll(() => flowNode(page)).toBe(next);
  await exit.click();
  await openAssistantPanel(page);

  const tag = aide.getByRole('button', { name: 'Open material: ' + first });
  await expect(tag).toHaveText(first!);
  await desktopApp.evaluate(() => {
    const state = globalThis as typeof globalThis & { releaseAideMaterialReply?: () => void };
    state.releaseAideMaterialReply?.();
  });
  await expect(aide.getByText('A shorter opening.')).toBeVisible();
  await tag.click();
  await expect(tag).toHaveText('This material');
  await expect(page.getByText('Body for ' + first, { exact: true })).toBeVisible();
  await enter.click();
  await expect.poll(() => flowNode(page)).toBe(next);
  await expect(page.getByText('Body for ' + next, { exact: true })).toBeVisible();
  await exit.click();
  fs.mkdirSync('.tmp/artifacts/T775/native', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T775/native/conversation.png' });

  await page.reload();
  await expectWorkspaceShell(page);
  await openAssistantPanel(page);
  await expect(tag).toHaveText(first!);
  await page.screenshot({ path: '.tmp/artifacts/T775/native/history.png' });
  await enter.click();
  await expect.poll(() => flowNode(page)).toBe(next);
  await expect(page.getByText('Body for ' + next, { exact: true })).toBeVisible();
});

test('links materials after the reply and restores the overflow menu from desktop history', async ({ desktopApp, desktopWindow: page }) => {
  const third = 'aide-link-third';
  await prepare(page, desktopApp, [...articleIds, third]);
  const first = articleIds[0]!;
  const second = articleIds[1]!;
  const openArticle = (id: string) => page.getByRole('treeitem', { name: id, exact: true }).click();
  await openArticle(first);
  await openAssistantPanel(page);
  const aide = page.locator('[data-panel-content-root="assistant"]');
  await aide.getByRole('textbox', { name: 'Foliole Aide message' }).fill('Compare these notes');
  await aide.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => desktopApp.evaluate(() =>
    typeof (globalThis as typeof globalThis & { releaseAideMaterialReply?: () => void }).releaseAideMaterialReply
  )).toBe('function');
  await openArticle(second);
  const add = aide.getByRole('button', { name: 'Link current material' });
  await expect(add).toBeDisabled();
  await expect(aide.getByRole('button', { name: 'Open material: ' + second })).toHaveCount(0);
  await desktopApp.evaluate(() =>
    (globalThis as typeof globalThis & { releaseAideMaterialReply?: () => void }).releaseAideMaterialReply?.()
  );
  await expect(aide.getByText('A shorter opening.')).toBeVisible();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(add).toBeDisabled();
  await expect(aide.getByRole('button', { name: 'Open material: ' + second })).toHaveText('This material');
  await openArticle(third);
  await add.click();
  await expect(aide.getByRole('button', { name: 'More linked materials' })).toBeVisible();
  await page.reload();
  await expectWorkspaceShell(page);
  await openAssistantPanel(page);
  const history = aide.getByRole('list', { name: 'Local Foliole Aide history' });
  await expect(history.getByRole('button', { name: 'Open material: ' + first })).toBeVisible();
  await history.getByRole('button', { name: 'Open material: ' + second }).click();
  await expect(page.getByText('Body for ' + second, { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'More linked materials' }).click();
  const thirdLink = page.getByRole('menuitem', { name: third, exact: true });
  await expect(thirdLink).toBeVisible();
  fs.mkdirSync('.tmp/artifacts/T775/native', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T775/native/more-materials.png' });
  await thirdLink.click();
  await expect(page.getByText('Body for ' + third, { exact: true })).toBeVisible();

});

test('shows composer focus on the rounded border without an inner outline', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(page, desktopApp);
  await openAssistantPanel(page);
  const input = page.getByRole('textbox', { name: 'Foliole Aide message' });
  const composer = page.locator('form').filter({ has: input });
  const unfocusedBorder = await composer.evaluate(form => getComputedStyle(form).borderColor);
  await input.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS('outline-style', 'none');
  await expect(composer).not.toHaveCSS('border-color', unfocusedBorder);
  await composer.screenshot({ path: '.tmp/artifacts/aide-composer-focus.png' });
});

test('unlinks draft and saved materials without changing the opening material', async ({ desktopApp, desktopWindow: page }) => {
  const third = 'aide-link-third';
  await prepare(page, desktopApp, [...articleIds, third]);
  const [first, second] = articleIds;
  const openArticle = (id: string) => page.getByRole('treeitem', { name: id, exact: true }).click();
  await openArticle(first!);
  await openAssistantPanel(page);
  const aide = page.locator('[data-panel-content-root="assistant"]');
  const add = aide.getByRole('button', { name: 'Link current material' });
  const send = aide.getByRole('button', { name: 'Send', exact: true });
  const input = aide.getByRole('textbox', { name: 'Foliole Aide message' });
  const unlink = (id: string) => aide.getByRole('button', { name: 'Unlink material: ' + id });
  await add.click();
  await unlink(first!).click();
  await expect(unlink(first!)).toHaveCount(0);
  await expect(add).toBeEnabled();

  await input.fill('Compare these notes');
  await send.click();
  await expect.poll(() => desktopApp.evaluate(() =>
    typeof (globalThis as typeof globalThis & { releaseAideMaterialReply?: () => void }).releaseAideMaterialReply
  )).toBe('function');
  await desktopApp.evaluate(() =>
    (globalThis as typeof globalThis & { releaseAideMaterialReply?: () => void }).releaseAideMaterialReply?.()
  );
  await expect(aide.getByText('A shorter opening.')).toBeVisible();
  await expect(unlink(first!)).toHaveCount(0);
  await openArticle(second!);
  await add.click();
  await expect(unlink(second!)).toBeVisible();
  await aide.screenshot({ path: '.tmp/artifacts/aide-material-unlink.png' });
  await openArticle(third);
  await add.click();
  await aide.getByRole('button', { name: 'More linked materials' }).click();
  await page.getByRole('menuitem', { name: 'Unlink material: ' + third }).click();
  await expect(aide.getByRole('button', { name: 'More linked materials' })).toHaveCount(0);
  await openArticle(second!);
  await unlink(second!).click();
  await expect(aide.getByRole('button', { name: 'Open material: ' + second })).toHaveCount(0);
  await expect(add).toBeEnabled();

  await input.fill('Use the opening material again');
  await send.click();
  await expect.poll(() => desktopApp.evaluate(() =>
    (globalThis as typeof globalThis & { aideMaterialContext?: unknown }).aideMaterialContext
  )).toMatchObject({
    message: 'Use the opening material again',
    scope: 'workspace',
    conversationMaterials: [{ nodeId: first }]
  });

  await page.reload();
  await expectWorkspaceShell(page);
  await openAssistantPanel(page);
  const history = aide.getByRole('list', { name: 'Local Foliole Aide history' });
  await expect(history.getByRole('button', { name: 'Open material: ' + first })).toBeVisible();
  await expect(history.getByRole('button', { name: 'Open material: ' + second })).toHaveCount(0);
});
