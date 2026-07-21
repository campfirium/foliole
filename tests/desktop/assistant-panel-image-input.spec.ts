import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const SCREENSHOT_PATH = path.join(
  process.cwd(), '.tmp', 'artifacts', 'assistant-panel-image-input.png'
);

test('Aide sends an image and restores it after renderer restart', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await prepareAidePanel(desktopApp, desktopWindow);
  await attachImage(desktopWindow);
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/)
    .fill('Describe attachment');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('received-images:1')).toBeVisible();

  await desktopWindow.reload();
  await openAssistantPanel(desktopWindow);
  await desktopWindow.getByRole('button', { name: /Describe attachment/ }).click();
  await expect(desktopWindow.getByRole('img', { name: 'diagram.png' })).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.locator('[data-panel-scale-id="right-panel:assistant"]')
    .screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('assistant-panel-image-input', {
    contentType: 'image/png',
    path: SCREENSHOT_PATH
  });
});

test('Aide keeps the image draft after a failed send', async ({ desktopApp, desktopWindow }) => {
  await prepareAidePanel(desktopApp, desktopWindow);
  await attachImage(desktopWindow);
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Fail image turn');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByText(/could not reply|未能回复/)).toBeVisible();
  await expect(desktopWindow.locator('form').getByRole('img', { name: 'diagram.png' })).toBeVisible();
  await expect(desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/))
    .toHaveValue('Fail image turn');
});

async function prepareAidePanel(electronApp: ElectronApplication, page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await installImageIpcMock(electronApp);
  await page.reload();
  await openAssistantPanel(page);
}

async function attachImage(page: Page) {
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimeType: 'image/png',
    name: 'diagram.png'
  });
  await expect(page.getByRole('img', { name: 'diagram.png' })).toBeVisible();
}

async function openAssistantPanel(page: Page) {
  const direct = page.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  const more = page.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ });
  await expect(direct.first().or(more)).toBeVisible();
  if (await direct.count()) return direct.first().click();
  await more.click();
  await page.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}

async function installImageIpcMock(electronApp: ElectronApplication) {
  const fixture = {
    assistantMessage: messageRecord('turn-image:assistant', 'assistant', 'received-images:1'),
    image: { id: 'a'.repeat(64), mimeType: 'image/png', originalName: 'diagram.png', sizeBytes: 8 },
    status: readyStatus(),
    thread: threadRecord(),
    userMessage: messageRecord('turn-image:user', 'user', 'Describe attachment')
  };
  await electronApp.evaluate(({ ipcMain }, values) => {
    let imageContent = '';
    let messages: unknown[] = [];
    let thread: typeof values.thread | null = null;
    const handle = async (_event: unknown, request: ImageInvokeRequest) => {
      if (request.command === 'assistant_get_status') return values.status;
      if (request.command === 'assistant_list_thread_index') return thread ? [thread] : [];
      if (request.command === 'assistant_list_thread_messages') return messages;
      if (request.command === 'assistant_read_image_attachment') return {
        attachmentId: request.args?.attachmentId,
        contentBase64: imageContent,
        mimeType: 'image/png',
        status: 'ready'
      };
      if (request.command !== 'assistant_send_message') return null;
      if (request.args?.message === 'Fail image turn')
        return { failure: { category: 'protocol_error' }, provider: 'codex-app-server', state: 'failed' };
      const draft = request.args?.images?.[0];
      imageContent = draft?.contentBase64 ?? '';
      thread = values.thread;
      messages = [
        { ...values.userMessage, images: [{ ...values.image, originalName: draft?.originalName ?? 'diagram.png' }] },
        values.assistantMessage
      ];
      return {
        message: {
          text: `received-images:${request.args?.images?.length ?? 0}`,
          threadId: 'thread-image',
          turnId: 'turn-image'
        },
        provider: 'codex-app-server',
        state: 'ready',
        threadIndex: thread
      };
    };
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', handle);
  }, fixture);
}

type ImageDraft = { contentBase64: string; mimeType: string; originalName: string; sizeBytes: number };
type ImageInvokeRequest = {
  args?: { attachmentId?: string; images?: ImageDraft[]; message?: string };
  command?: string;
};

function messageRecord(id: string, role: 'assistant' | 'user', text: string, images?: unknown[]) {
  return {
    createdAt: '2026-07-10T00:00:00.000Z', id, ...(images ? { images } : {}),
    provider: 'codex-app-server', providerThreadId: 'thread-image', role, text
  };
}

function threadRecord() {
  return {
    agentToolVersion: 2, archivedAt: null, continuedFromThreadId: null,
    createdAt: '2026-07-10T00:00:00.000Z', deletedAt: null,
    lastOpenedAt: '2026-07-10T00:00:00.000Z', location: { type: 'workspace' },
    preview: 'Describe attachment', provider: 'codex-app-server', providerThreadId: 'thread-image',
    readError: null, readState: 'not_requested', status: 'active', title: 'Describe attachment',
    updatedAt: '2026-07-10T00:00:00.000Z'
  };
}

function readyStatus() {
  return {
    agentControl: { capabilities: ['materials.read'], state: 'running' },
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'agentControl' },
      { enabled: true, name: 'threadIndex' }
    ],
    provider: 'codex-app-server', state: 'ready'
  };
}
