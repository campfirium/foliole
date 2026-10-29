import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('opens scheduling from database facts without publishing them into the workspace', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const before = await page.evaluate(async () => {
    const at = new Date().toISOString();
    const reading = { intervalDurationMs: 86400000, intervalGrowthFactor: 1.3, lastHandledAt: at,
      nextAt: at, priority: 5, readingPosition: 0, repetitionCount: 1, state: 'active' as const };
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'inspector-topic', kind: 'topic', title: 'Inspector database topic', content: 'Inspector body', reading }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('inspector-topic');
    const previous = window.__folioleWorkspaceDebug!.getNode('inspector-topic')?.reading;
    await window.electronAPI!.invoke('save_node_reading_state', {
      nodeId: 'inspector-topic', reading: { ...reading, repetitionCount: 19 }, updatedAt: at
    });
    return previous;
  });
  await page.locator('[data-panel-id="dev"]').click();
  const panel = page.locator('[data-panel-content-root="dev"]');
  await expect(panel.getByText('19', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getNode('inspector-topic')?.reading)).toEqual(before);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T632/inspector-database.png') });
});
