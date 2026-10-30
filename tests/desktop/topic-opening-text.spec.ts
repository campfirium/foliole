import { mkdirSync } from 'node:fs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const BODY = 'A quick note.';

test('a newly typed short topic shows its opening in Inbox before and after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => window.__folioleWorkspaceDebug!.openNode!('special-inbox'));
  await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.insertText(BODY);
  await expect.poll(() => page.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug!;
    return debug.getNode(debug.getActiveNodeId()!)?.content;
  })).toBe(BODY);
  const id = await page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId()!);
  await page.evaluate(async () => window.__folioleWorkspaceDebug!.openNode!('special-inbox'));
  await expect.poll(() => page.evaluate(async nodeId => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    return snapshot?.nodesById[nodeId]?.openingText;
  }, id)).toBe(BODY);
  const summary = page.getByTestId(`folder-list-excerpt-${id}`);
  await expect(summary).toHaveText(BODY);
  mkdirSync('.tmp/artifacts/T643', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T643/desktop-opening.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => window.__folioleWorkspaceDebug!.openNode!('special-inbox'));
  await expect(summary).toHaveText(BODY);
});
