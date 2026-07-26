import { execFileSync } from 'node:child_process';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-source-update-escape-topic';
const NODE_TITLE = 'Playwright Source Update Escape Topic';
const CURRENT_CONTENT = [
  'Source update current paragraph one.',
  '',
  'Source update current paragraph two.',
  '',
  'Source update current paragraph three.'
].join('\n');
const UPDATED_CONTENT = [
  'Source update incoming paragraph one with changed wording.',
  '',
  'Source update current paragraph two.',
  '',
  'Source update incoming paragraph three with a longer replacement.'
].join('\n');

async function sendNativeKeyboardEscape(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async ({ BrowserWindow }) => {
    const targets = BrowserWindow.getAllWindows();
    if (targets.length === 0) {
      throw new Error('missing browser window');
    }
    for (const target of targets) {
      target.webContents.send('foliole:native-keyboard-input', {
        altKey: false,
        code: 'Escape',
        controlKey: false,
        key: 'Escape',
        metaKey: false,
        shiftKey: false,
        type: 'keyDown'
      });
    }
  });
}

async function recordNativeKeyboardInput(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    const targetWindow = globalThis.window as Window & {
      __sourceUpdateNativeKeyboardEvents?: unknown[];
    };
    targetWindow.__sourceUpdateNativeKeyboardEvents = [];
    globalThis.window?.electronAPI?.onNativeKeyboardInput?.((payload) => {
      targetWindow.__sourceUpdateNativeKeyboardEvents?.push(payload);
    });
  });
}

async function sawNativeKeyboardEscape(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const events = (globalThis.window as Window & {
      __sourceUpdateNativeKeyboardEvents?: Array<{ key?: string; type?: string }>;
    }).__sourceUpdateNativeKeyboardEvents ?? [];
    return events.some((event) => event.key === 'Escape' && event.type === 'keyDown');
  });
}

async function seedSourceUpdateWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(
    async ({ content, nodeId, title }) => {
      const api = globalThis.window?.__folioleWorkspaceDebug;
      if (!api) {
        throw new Error('missing workspace debug bridge');
      }
      await api.seedNodes([
        {
          content,
          id: nodeId,
          kind: 'topic',
          title
        }
      ], { persist: true });
      await globalThis.window?.electronAPI?.invoke('update_node_content', {
        anchorLink: null,
        content,
        createdAt: '2026-07-05T00:00:00.000Z',
        desiredRetention: null,
        hideTitleHeading: false,
        imageRegions: null,
        isTitleManual: true,
        kind: 'topic',
        nodeId,
        parentNodeId: null,
        position: 1,
        priority: null,
        reading: null,
        reveal: null,
        review: null,
        title,
        updatedAt: '2026-07-05T00:00:10.000Z',
        virtualFilter: null
      });
    },
    { content: CURRENT_CONTENT, nodeId: NODE_ID, title: NODE_TITLE }
  );
}

async function seedPendingIncomingUpdate(desktopApp: ElectronApplication) {
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) {
    throw new Error('missing isolated library home');
  }
  const dbPath = path.join(libraryHome, 'Data', 'foliole.db');
  const script = [
    "const Database = require('better-sqlite3');",
    'const db = new Database(process.argv[1]);',
    'db.prepare(`INSERT INTO incoming_updates (id, topic_id, source_type, source_path, updated_content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(topic_id, source_type, source_path, status) DO UPDATE SET updated_content = excluded.updated_content, updated_at = excluded.updated_at`).run(process.argv[2], process.argv[3], "import_file", process.argv[4], process.argv[5], "pending", "2026-07-05T00:00:00.000Z", "2026-07-05T00:00:10.000Z");',
    'db.close();'
  ].join('\n');
  const distPath = path.join(process.cwd(), 'node_modules', 'electron', 'dist');
  const executablePath = process.platform === 'darwin'
    ? path.join(distPath, 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(distPath, process.platform === 'win32' ? 'electron.exe' : 'electron');
  execFileSync(executablePath, [
    '-e',
    script,
    dbPath,
    'playwright-incoming-update-escape',
    NODE_ID,
    'playwright/source-update-escape.md',
    UPDATED_CONTENT
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: 'pipe'
  });
}

test('Escape closes the source update panel while an editor has focus', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
  await seedSourceUpdateWorkspace(desktopWindow);
  await seedPendingIncomingUpdate(desktopApp);
  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('special-inbox');
  });
  await desktopWindow.evaluate(async ({ nodeId }) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId);
  }, { nodeId: NODE_ID });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
  await expect.poll(
    () => desktopWindow.evaluate(async ({ nodeId }) =>
      globalThis.window?.electronAPI?.invoke('load_node_source_update_preview', { node_id: nodeId }) ?? null,
    { nodeId: NODE_ID }),
    { message: 'waiting for native source update preview' }
  ).toMatchObject({
    incoming_update_id: 'playwright-incoming-update-escape',
    kind: 'incoming_update',
    source_node_id: NODE_ID
  });
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('foliole:managed-inbox-updated', { importId: 'playwright-source-update-escape' });
    });
  });

  await desktopWindow.getByRole('button', { name: /Review Source Update|查看来源更新/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Close source update panel|关闭来源更新面板/ })).toHaveCount(0);

  const editor = dialog.locator('.cm-content[contenteditable="true"]').first();
  await editor.click();
  await recordNativeKeyboardInput(desktopWindow);
  await sendNativeKeyboardEscape(desktopApp);
  await expect.poll(() => sawNativeKeyboardEscape(desktopWindow), { message: 'waiting for native keyboard IPC' }).toBe(true);

  await expect(dialog).toBeHidden();
});
