import { mkdirSync } from 'node:fs';

import { openEditingSession } from './editorContentEditing.test-support';
import { creationFacts, creationReceipt, delayCreationReceipt } from './editorCreationReceipt.test-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const kind of ['plain', 'code']) {
  test(`finishes a new ${kind} topic after exiting before its creation receipt`, async ({ desktopWindow: page, desktopSession: session }) => {
    const { window: appWindow } = await openEditingSession(session, page);
    await delayCreationReceipt(session);
    try {
      await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
      await expect.poll(() => creationReceipt(session)).toMatchObject({ ready: true });
      const { nodeId } = await creationReceipt(session);
      const editor = page.locator('.prompt-editor-host .cm-content');
      await expect(editor).toBeEditable();
      await editor.click();
      const content = kind === 'code' ? '```js\nconst value = 1;\n```\n尾部 中😀' : 'New topic tail 中😀';
      await page.keyboard.insertText(content);
      await expect(editor).toBeFocused();
      await expect.poll(() => creationFacts(session, nodeId)).toMatchObject({ editing: true, content: '' });
      await page.keyboard.press('Escape');
      await expect(editor).not.toBeFocused();
      expect((await creationFacts(session, nodeId)).editing).toBe(true);
      await creationReceipt(session, true);
      await expect.poll(() => creationFacts(session, nodeId)).toEqual({ editing: false, content });
      expect(await appWindow.evaluate(window => window.isFocused())).toBe(true);
      await expect(editor).not.toBeFocused();
      await page.reload();
      await expectWorkspaceShell(page);
      expect(await creationFacts(session, nodeId)).toEqual({ editing: false, content });
      await page.evaluate(nodeId => window.__folioleWorkspaceDebug?.openNode(nodeId), nodeId);
      await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
      mkdirSync('.tmp/artifacts/T727', { recursive: true });
      await page.screenshot({ path: `.tmp/artifacts/T727/creation-session-${kind}.png` });
    } finally {
      await session.electronApp.evaluate(() => {
        const state = Reflect.get(globalThis, 'creationReceipt');
        state.release(); state.restore();
      });
    }
  });
}


test('does not reclaim creation focus after navigating away and back', async ({ desktopWindow: page, desktopSession: session }) => {
  await openEditingSession(session, page);
  const previousId = await page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId());
  await delayCreationReceipt(session);
  try {
    await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
    await expect.poll(() => creationReceipt(session)).toMatchObject({ ready: true });
    const { nodeId } = await creationReceipt(session);
    await page.evaluate(previousId => window.__folioleWorkspaceDebug?.openNode(previousId!), previousId);
    await page.evaluate(nodeId => window.__folioleWorkspaceDebug?.openNode(nodeId), nodeId);
    const button = page.getByRole('button', { name: /^(Create topic|创建主题)$/ });
    await button.focus();
    await creationReceipt(session, true);
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getWorkspaceStructureHistory().pendingCreate)).toBeNull();
    await expect.poll(() => creationFacts(session, nodeId)).toEqual({ editing: false, content: '' });
    await expect(button).toBeFocused();
  } finally {
    await session.electronApp.evaluate(() => {
      const state = Reflect.get(globalThis, 'creationReceipt');
      state.release(); state.restore();
    });
  }
});
