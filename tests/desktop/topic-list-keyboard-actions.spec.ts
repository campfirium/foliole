import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FIRST = 'keyboard-topic-a';
const SECOND = 'keyboard-topic-b';

async function seedTopics(page: Parameters<typeof expectWorkspaceShell>[0]) {
  await expectWorkspaceShell(page);
  await page.evaluate(async (seeds) => window.__folioleWorkspaceDebug?.seedNodes?.(seeds), [
    { content: 'First body', id: FIRST, kind: 'topic', title: 'Keyboard first' },
    { content: 'Second body', id: SECOND, kind: 'topic', title: 'Keyboard second' }
  ]);
  await expect(page.locator(`[role="treeitem"][data-node-id="${FIRST}"]`)).toBeVisible();
  await expect(page.locator(`[role="treeitem"][data-node-id="${SECOND}"]`)).toBeVisible();
}

test('Delete moves the selected topics together to Trash', async ({ desktopWindow }) => {
  await seedTopics(desktopWindow);
  const first = desktopWindow.locator(`[role="treeitem"][data-node-id="${FIRST}"]`);
  const second = desktopWindow.locator(`[role="treeitem"][data-node-id="${SECOND}"]`);

  await first.click();
  await second.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await second.focus();
  await desktopWindow.keyboard.press('Delete');

  await expect.poll(() => desktopWindow.evaluate(([firstId, secondId]) => {
    const debug = window.__folioleWorkspaceDebug;
    return [debug?.getNode(firstId)?.trashed, debug?.getNode(secondId)?.trashed];
  }, [FIRST, SECOND])).toEqual([true, true]);
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/topic-list-bulk-delete.png') });
});

test('IME Enter keeps folder rename open until the next Enter', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (seeds) => window.__folioleWorkspaceDebug?.seedNodes?.(seeds), [
    { content: '', id: FIRST, kind: 'folder', title: 'Keyboard folder' }
  ]);
  const first = desktopWindow.locator(`[role="treeitem"][data-node-id="${FIRST}"]`);
  await first.dblclick();
  const input = desktopWindow.getByRole('textbox', { name: 'Rename Keyboard folder' });
  await input.fill('pin');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', { bubbles: true, cancelable: true, isComposing: true, key: 'Enter' });
  await input.dispatchEvent('compositionend');

  await expect(input).toBeVisible();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode(nodeId)?.title ?? null, FIRST
  )).toBe('Keyboard folder');

  await input.press('Enter');
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode(nodeId)?.title ?? null, FIRST
  )).toBe('pin');
});
