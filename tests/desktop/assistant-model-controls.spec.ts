import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { openAssistantPanel } from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';

const SCREENSHOT_PATH = path.join(
  process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance', 'aide-model-controls-hidden.png'
);

test('Aide persists a catalog-backed model selection and sends it on the next turn', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installModelControlsMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  const settings = desktopWindow.getByRole('button', {
    name: /^(Model and performance settings|模型与性能设置)$/
  });
  await expect(settings).toBeEnabled();
  await settings.click();
  await desktopWindow.getByRole('menuitem', { name: 'GPT Alternate' }).click();
  await settings.click();
  await desktopWindow.getByRole('menuitem', { name: /^(High|高)$/ }).click();
  await settings.click();
  await desktopWindow.getByRole('menuitem', { name: 'Fast' }).click();

  await settings.hover();
  await expect(desktopWindow.getByText(/GPT Alternate.*(High|高).*Fast/))
    .toBeVisible();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Configured turn');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('Configured response')).toBeVisible();

  const selection = await readSentSelection(desktopApp);
  expect(selection).toEqual({ effort: 'high', model: 'gpt-alternate', serviceTier: 'fast' });

  await desktopWindow.reload();
  await openAssistantPanel(desktopWindow);
  await settings.hover();
  await expect(desktopWindow.getByText(/GPT Alternate.*(High|高).*Fast/))
    .toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /microphone|麦克风/i })).toHaveCount(0);

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.locator('[data-panel-scale-id="right-panel:assistant"]')
    .screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('aide-model-controls', { contentType: 'image/png', path: SCREENSHOT_PATH });
});

async function installModelControlsMock(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ ipcMain }, values) => {
    globalThis.__folioleAideModelRequests = [];
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      globalThis.__folioleAideModelRequests.push(request);
      if (request.command === 'assistant_get_status') return values.status;
      if (request.command === 'desktop_update_check') return { phase: 'not-applicable' };
      if (request.command === 'assistant_list_models') return values.catalog;
      if (request.command === 'assistant_list_thread_index') return [];
      if (request.command === 'assistant_send_message') return values.sendResult;
      return null;
    });
  }, {
    catalog: modelCatalog(),
    sendResult: {
      message: { text: 'Configured response', threadId: 'thread-model', turnId: 'turn-model' },
      provider: 'codex-app-server',
      state: 'ready',
      threadIndex: threadRecord()
    },
    status: readyStatus()
  });
}

async function readSentSelection(electronApp: ElectronApplication) {
  return electronApp.evaluate(() => {
    const send = globalThis.__folioleAideModelRequests.find(
      (request) => request.command === 'assistant_send_message'
    );
    return (send?.args as { modelSelection?: unknown } | undefined)?.modelSelection;
  });
}

function modelCatalog() {
  const descriptions: Record<string, string> = {
    high: 'Greater reasoning depth for complex problems',
    medium: 'Balances speed and reasoning depth for everyday tasks'
  };
  const option = (effort: string) => ({ description: descriptions[effort] ?? effort, effort });
  return { models: [{
    defaultReasoningEffort: 'medium', defaultServiceTier: null,
    description: 'Default model', displayName: 'GPT Default', isDefault: true, model: 'gpt-default',
    serviceTiers: [], supportedReasoningEfforts: [option('medium')]
  }, {
    defaultReasoningEffort: 'medium', defaultServiceTier: null,
    description: 'Alternate model', displayName: 'GPT Alternate', isDefault: false, model: 'gpt-alternate',
    serviceTiers: [{ description: 'Faster responses', id: 'fast', name: 'Fast' }],
    supportedReasoningEfforts: [option('medium'), option('high')]
  }] };
}

function readyStatus() {
  return {
    agentControl: { capabilities: ['materials.read'], state: 'running' },
    capabilities: [
      { enabled: true, name: 'status' }, { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'agentControl' }, { enabled: true, name: 'threadIndex' }
    ],
    provider: 'codex-app-server', state: 'ready'
  };
}

function threadRecord() {
  return {
    agentToolVersion: 2, archivedAt: null, continuedFromThreadId: null,
    createdAt: '2026-08-04T00:00:00.000Z', deletedAt: null, lastOpenedAt: '2026-08-04T00:00:00.000Z',
    location: { type: 'workspace' }, preview: 'Configured turn', provider: 'codex-app-server',
    providerThreadId: 'thread-model', readError: null, readState: 'not_requested', status: 'active',
    title: 'Configured turn', updatedAt: '2026-08-04T00:00:00.000Z'
  };
}

declare global {
  var __folioleAideModelRequests: Array<{ args?: unknown; command?: string }>;
}
