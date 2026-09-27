import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-editor-decoration-recovery';
const SHORT_CONTENT = 'x'.repeat(195);

test('keeps topic editing available after a searched document becomes shorter and reopens', async ({ desktopSession, desktopWindow }) => {
  let reopened: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  const pageErrors: string[] = [];
  desktopWindow.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await expectWorkspaceShell(desktopWindow);

    await desktopWindow.evaluate(async ({ nodeId, content }) => {
      const api = window.__folioleWorkspaceDebug;
      await api?.seedNodes?.([{ content, id: nodeId, kind: 'topic', title: 'Editor decoration recovery' }]);
      await api?.openNode?.(nodeId);
    }, { nodeId: NODE_ID, content: `${'x'.repeat(3390)}SEARCH_NEEDLE` });
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toContain('SEARCH_NEEDLE');

    await desktopWindow.evaluate(() => window.dispatchEvent(new Event('foliole:document-topic-search-open')));
    await desktopWindow.getByLabel(/^(Topic search|主题内搜索)$/).fill('SEARCH_NEEDLE');
    await expect(desktopWindow.locator('.prompt-editor-host .cm-topic-search-match-active')).toHaveCount(1);

    await desktopWindow.evaluate(async ({ nodeId, content }) => {
      await window.__folioleWorkspaceDebug?.updateNodeContent?.(nodeId, content);
    }, { nodeId: NODE_ID, content: SHORT_CONTENT });
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toBe(SHORT_CONTENT);

    const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
    await editor.click();
    await editor.press('End');
    await editor.press('a');
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toBe(`${SHORT_CONTENT}a`);
    await expect.poll(() => desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.content, NODE_ID))
      .toBe(`${SHORT_CONTENT}a`);
    await expectWorkspaceShell(desktopWindow);
    expect(pageErrors).toEqual([]);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    reopened = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    reopened.firstWindow.on('pageerror', (error) => pageErrors.push(error.message));
    await expectWorkspaceShell(reopened.firstWindow);
    await reopened.firstWindow.evaluate(async (nodeId) => {
      await window.__folioleWorkspaceDebug?.openNode?.(nodeId);
    }, NODE_ID);
    await expect.poll(() => reopened!.firstWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toBe(`${SHORT_CONTENT}a`);
    await reopened.firstWindow.locator('.prompt-editor-host .cm-content').press('b');
    await expect.poll(() => reopened!.firstWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toHaveLength(197);
    expect(pageErrors).toEqual([]);
  } finally {
    await reopened?.close();
  }
});
