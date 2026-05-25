import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedReviewWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Alpha\nBeta\nGamma',
        id: 'playwright-review-escape-topic',
        kind: 'topic',
        title: 'Playwright Review Escape Topic'
      }
    ]);
    await api?.openNode?.('playwright-review-escape-topic');
  });
}

async function enterFlowMode(desktopWindow: Page) {
  await desktopWindow.getByRole('button', { name: 'Enter Flow' }).click();
  await expect(desktopWindow.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
  await desktopWindow.getByRole('button', { name: 'Playwright Review Escape Topic' }).click();
  await expect(desktopWindow.getByRole('main', { name: 'Foliole workspace' })).toContainText('Playwright Review Escape Topic');
}

async function focusPromptEditor(desktopWindow: Page) {
  const focused = await desktopWindow.evaluate(() => {
    return globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 2, 2) ?? false;
  });
  expect(focused).toBe(true);
  await expect.poll(() => collectFocusState(desktopWindow)).toMatchObject({ isEditorFocused: true });
}

async function collectFocusState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      activeRole: active?.getAttribute('role') ?? null,
      activeTagName: active?.tagName ?? null,
      hasPostponeDialog: Boolean(document.querySelector('[role="dialog"]')),
      isEditorFocused: Boolean(active?.closest('.prompt-editor-host')),
      reviewCaretLine: document.querySelector('.markdown-editor-host')?.getAttribute('data-review-caret-line') ?? null
    };
  });
}

async function sendNativeEscape(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    if (!target) throw new Error('missing browser window');
    target.focus();
    target.webContents.focus();
    target.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyDown' });
    target.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyUp' });
  });
}

test('Escape closes postpone panel first, then leaves review editor editing', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedReviewWorkspace(desktopWindow);
  await enterFlowMode(desktopWindow);
  await focusPromptEditor(desktopWindow);

  const editor = desktopWindow.getByRole('textbox').first();
  await editor.press('Control+J');
  await expect(desktopWindow.getByRole('dialog')).toBeVisible();
  await editor.press('Escape');
  await expect(desktopWindow.getByRole('dialog')).toBeHidden();
  expect(await collectFocusState(desktopWindow)).toMatchObject({
    hasPostponeDialog: false,
    isEditorFocused: true
  });

  await sendNativeEscape(desktopApp);

  await expect.poll(() => collectFocusState(desktopWindow), {
    message: 'waiting for second Escape to leave review editor editing'
  }).toMatchObject({ isEditorFocused: false });
});
