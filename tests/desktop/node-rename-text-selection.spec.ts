import process from 'node:process';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const DRAFT_TITLE = 'Mouse selection remains text selection';

test('dragging across a title during rename selects text instead of dragging the row', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  const beforeNodeId = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  await expect.poll(() => desktopWindow.evaluate(() => (
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  ))).not.toBe(beforeNodeId);
  const nodeId = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  const row = desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`);
  const frame = row.locator('..');

  await desktopWindow.keyboard.press('F2');
  const input = desktopWindow.locator('input[aria-label^="Rename "]');
  await expect(input).toBeFocused();
  await expect(frame).toHaveAttribute('draggable', 'false');
  await input.fill(DRAFT_TITLE);
  const box = await input.boundingBox();
  expect(box).toBeTruthy();
  await desktopWindow.mouse.move(box!.x + 8, box!.y + box!.height / 2);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(box!.x + 70, box!.y + box!.height / 2);
  await desktopWindow.mouse.up();

  const selectedLength = await input.evaluate((element) => {
    const target = element as HTMLInputElement;
    return (target.selectionEnd ?? 0) - (target.selectionStart ?? 0);
  });
  expect(selectedLength).toBeGreaterThan(0);
  expect(selectedLength).toBeLessThan(DRAFT_TITLE.length);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/node-rename-text-selection.png' });
  await desktopWindow.keyboard.press('Escape');
  await expect(frame).toHaveAttribute('draggable', 'true');
});
