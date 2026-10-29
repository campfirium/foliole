import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('saves content without loaded learning fields and retains learning after reopening', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const before = await page.evaluate(async () => {
    const now = new Date().toISOString();
    const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now,
      nextAt: now, priority: 3, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: 'content-learning', kind: 'topic',
      title: 'Preserved learning', content: 'Original content', reading }], { persist: true });
    const saved = (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById['content-learning']!;
    const { id, reading: ignoredReading, review: ignoredReview, ...content } = saved;
    void ignoredReading; void ignoredReview;
    await window.electronAPI.invoke('update_node_content', { ...content, nodeId: id,
      content: 'Edited content with preserved learning.', updatedAt: new Date().toISOString() });
    return saved.reading;
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('content-learning'));
  await expect(page.locator('.prompt-editor-host')).toContainText('Edited content with preserved learning.');
  const saved = await page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
  expect(saved.nodesById['content-learning']?.reading).toEqual(before);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T632/content-learning-preserved.png') });
});
