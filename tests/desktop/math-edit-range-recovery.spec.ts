import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-math-range-recovery';
const SHORT_CONTENT = 'x'.repeat(195);

test('keeps the desktop usable after a stale formula callback and relaunch', async ({ desktopSession, desktopWindow }) => {
  let reopened: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  const pageErrors: string[] = [];
  desktopWindow.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await expectWorkspaceShell(desktopWindow);

    await desktopWindow.evaluate(async ({ nodeId, content }) => {
      const api = window.__folioleWorkspaceDebug;
      await api?.seedNodes?.([{ content, id: nodeId, kind: 'topic', title: 'Math range recovery' }]);
      await api?.openNode?.(nodeId);
    }, { nodeId: NODE_ID, content: `${'x'.repeat(200)} $a$` });
    const button = desktopWindow.locator('.prompt-editor-host .cm-md-math-source-button');
    await expect(button).toHaveCount(1);

    await desktopWindow.evaluate(() => {
      (window as unknown as { oldMathButton?: HTMLButtonElement }).oldMathButton =
        document.querySelector<HTMLButtonElement>('.prompt-editor-host .cm-md-math-source-button') ?? undefined;
    });
    await desktopWindow.evaluate(async ({ nodeId, content }) => {
      await window.__folioleWorkspaceDebug?.updateNodeContent?.(nodeId, content);
    }, { nodeId: NODE_ID, content: SHORT_CONTENT });
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toBe(SHORT_CONTENT);

    await desktopWindow.evaluate(() => {
      const saved = window as unknown as { oldMathButton?: HTMLButtonElement };
      saved.oldMathButton?.click();
      delete saved.oldMathButton;
    });

    await expectWorkspaceShell(desktopWindow);
    expect(pageErrors).toEqual([]);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    reopened = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    await expectWorkspaceShell(reopened.firstWindow);
  } finally {
    await reopened?.close();
  }
});
