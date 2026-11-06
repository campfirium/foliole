import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { assistantReadyStatus, openAssistantPanel } from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T732-3/native');

async function mockAssistant(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }, status) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const record = { agentToolVersion: 1, archivedAt: null, continuedFromThreadId: null,
      createdAt: '2026-11-06T00:00:00Z', deletedAt: null, lastOpenedAt: '2026-11-06T00:00:00Z',
      location: { type: 'workspace' }, preview: 'Saved conversation', provider: 'codex-app-server',
      providerThreadId: 'continuity-thread', readError: null, readState: 'not_requested', status: 'active',
      title: 'Saved conversation', updatedAt: '2026-11-06T00:00:00Z' };
    const state = globalThis as typeof globalThis & {
      continuityRequests: unknown[]; finishContinuityAnswer?: () => void;
    };
    state.continuityRequests = [];
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      if (request.command === 'assistant_get_status') return status;
      if (request.command === 'assistant_list_thread_index') return [record];
      if (request.command === 'assistant_list_thread_messages') return [];
      if (request.command === 'assistant_send_message') {
        state.continuityRequests.push(request);
        return new Promise(resolve => { state.finishContinuityAnswer = () => resolve({
          provider: 'codex-app-server', state: 'ready', threadIndex: record,
          message: { text: 'Completed while another panel was open.', threadId: record.providerThreadId, turnId: 'turn' }
        }); });
      }
      if (request.command.startsWith('assistant_')) return null;
      return handleInvokeRequest(request, { sender: event.sender });
    });
  }, assistantReadyStatus);
}

async function showPanel(page: Page, id: 'outline' | 'review-queue') {
  const direct = page.locator(`.window-titlebar button[data-panel-id="${id}"]`);
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole('button', { name: 'More right sidebar panels', exact: true }).click();
    await page.getByRole('menuitem', { name: id === 'outline' ? /Outline/ : /Flow/ }).click();
  }
  await expect(page.locator(`[data-panel-content-root="${id}"]`)).toBeVisible();
}

async function prepare(app: ElectronApplication, page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-aide-enabled', 'true');
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: 'assistant-context', kind: 'topic',
      title: 'Assistant context', content: '# Assistant context\n\n## Inspection section\n\nBody.\n\n' + Array.from({ length: 80 }, (_, i) => `## More section ${i}\n\nBody.`).join('\n\n') }], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('assistant-context');
  });
  await mockAssistant(app);
  await page.reload();
  await expectWorkspaceShell(page);
  await openAssistantPanel(page);
}

test('keeps unsent content, conversation and in-flight results through native sidebar transitions', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(desktopApp, page);
  const input = page.getByRole('textbox', { name: 'Foliole Aide message' });
  await input.fill('Keep this unsent input');
  await page.locator('[data-panel-content-root="assistant"] input[type="file"]').setInputFiles({
    name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.getByAltText('diagram.png')).toBeVisible();
  await showPanel(page, 'outline');
  await expect(page.getByRole('button', { name: 'Inspection section', exact: true })).toBeVisible();
  await expect(input).not.toBeVisible();
  const outline = page.locator('[data-panel-content-root="outline"]');
  const priorScroll = await outline.evaluate(element => { element.scrollTop = element.scrollHeight / 2; return element.scrollTop; });
  expect(priorScroll).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click();
  expect(await outline.evaluate(element => element.scrollTop)).toBe(priorScroll);
  await openAssistantPanel(page);
  await expect(input).toHaveValue('Keep this unsent input');
  await expect(page.getByAltText('diagram.png')).toBeVisible();
  await showPanel(page, 'review-queue');
  await expect(page.getByRole('heading', { name: 'Flow', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click();
  await openAssistantPanel(page);
  await expect(input).toHaveValue('Keep this unsent input');
  await page.keyboard.press('F11');
  await expect(input).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('Keep this unsent input');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await showPanel(page, 'outline');
  await expect(page.getByRole('button', { name: 'Inspection section', exact: true })).toBeVisible();
  await desktopApp.evaluate(() => {
    (globalThis as typeof globalThis & { finishContinuityAnswer?: () => void }).finishContinuityAnswer?.();
  });
  await openAssistantPanel(page);
  await expect(page.getByText('Completed while another panel was open.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved conversation', exact: true })).toBeVisible();
  const requests = await desktopApp.evaluate(() => (globalThis as typeof globalThis & { continuityRequests: unknown[] }).continuityRequests);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ args: { message: 'Keep this unsent input', images: [expect.objectContaining({ originalName: 'diagram.png' })] } });
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'returned-answer.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ requests, answerVisible: true }, null, 2));
});
