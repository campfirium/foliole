import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T441/continue-reading-native');
const session = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'continue-review', kind: 'item', title: 'Review before reading', content: 'Review question', reveal: 'Review answer',
        review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0, stability: 0,
          difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 } },
      { id: 'continue-reading', kind: 'topic', title: 'Continue reading topic', content: 'Readable continuation body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue reading', exact: true })).toBeVisible();
  expect((await session(page)).currentNodeId).toBeNull();
}

async function installLostReceipt(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    let calls = 0;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      if (request.command === 'commit_daily_flow' && request.args.navigation === 'continue-reading') {
        calls += 1;
        const result = await handleInvokeRequest(request, { sender: event.sender });
        if (calls === 1) throw new Error('navigation_receipt_lost');
        return result;
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
}

test('continues from the existing button after a lost receipt and restores readable content on reload', async ({ desktopWindow: page, desktopApp: app }) => {
  await prepare(page);
  const before = await session(page);
  await installLostReceipt(app);
  await page.getByRole('button', { name: 'Continue reading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue reading', exact: true })).toBeVisible();
  expect((await session(page)).currentNodeId).toBeNull();
  await page.getByRole('button', { name: 'Continue reading', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('continue-reading');
  const saved = await session(page);
  expect(saved.daily!.revision).toBe(before.daily!.revision + 1);
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await expect(page.getByText('Readable continuation body', { exact: true })).toBeVisible();
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'continued.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(async () => (await session(page)).currentNodeId).toBe('continue-reading');
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await expect(page.getByText('Readable continuation body', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'restored.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before, saved, restored: await session(page) }, null, 2));
});
