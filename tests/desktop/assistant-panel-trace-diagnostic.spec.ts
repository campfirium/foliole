import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-trace-diagnostic.png'
);

const assistantTraceErrorStatus = {
  agentControl: {
    capabilities: ['materials.read'],
    descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
    descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
    state: 'running',
    trace: {
      count: 1,
      lastError: 'connection_failed',
      lastStatus: 'error',
      lastTimestamp: '2026-07-09T01:00:00.000Z',
      lastTool: 'foliole_materials_read'
    }
  },
  capabilities: [
    { enabled: true, name: 'status' },
    { enabled: false, name: 'sendMessage' },
    { enabled: true, name: 'agentControl' },
    { enabled: true, name: 'threadIndex' }
  ],
  failure: { category: 'auth_failed' },
  provider: 'codex-app-server',
  state: 'unavailable'
};

test('Aide panel shows the last MCP trace error detail', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantStatusMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  await expect(desktopWindow.getByText(/Last tool: foliole_materials_read|最近工具：foliole_materials_read/)).toBeVisible();
  await expect(desktopWindow.getByText(/Tool detail: connection_failed|工具详情：connection_failed/)).toBeVisible();
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-trace-diagnostic', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});

async function openAssistantPanel(desktopWindow: Page) {
  const directButton = desktopWindow.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  if (await directButton.count()) {
    await directButton.first().click();
    return;
  }
  await desktopWindow.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ }).click();
  await desktopWindow.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}

async function installAssistantStatusMock(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ ipcMain }, status) => {
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { command?: string }) => {
      if (request?.command === 'assistant_get_status') return status;
      if (request?.command === 'assistant_list_thread_index') return [];
      if (request?.command === 'assistant_list_thread_messages') return [];
      return null;
    });
  }, assistantTraceErrorStatus);
}
