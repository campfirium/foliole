import path from 'node:path';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const action of ['Read', 'Later', 'Dismiss'] as const) {
  test(`${action} uses database learning and preserves its original facts through undo and redo`, async ({ desktopWindow: page, desktopApp }) => {
    await expectWorkspaceShell(page);
    await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
    await page.reload(); await expectWorkspaceShell(page);
    await page.evaluate(async () => {
      const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
      const retired = Object.values(snapshot.nodesById).filter(node => node.kind === 'topic' || node.kind === 'item').map(node => node.id);
      if (retired.length) await window.electronAPI.invoke('soft_delete_nodes', { nodeIds: retired, deletedAt: new Date().toISOString() });
      await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b'].map(id => ({ id: `db-reading-${id}`, kind: 'topic' as const,
        title: `Database reading ${id}`, content: `Database reading body ${id}` })), { persist: true });
    });
    await resetDailyFlowGeneration(desktopApp);
    await page.reload(); await expectWorkspaceShell(page);
    await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
    await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toMatch(/^db-reading-[ab]$/);
    const before = await page.evaluate(async () => {
      const id = window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId!;
      const at = new Date().toISOString();
      const reading = { intervalDurationMs: 60000, intervalGrowthFactor: 1.3, lastHandledAt: at, nextAt: at,
        priority: 5, readingPosition: 0, repetitionCount: 7, state: 'active' as const };
      await window.electronAPI.invoke('save_node_reading_state', { nodeId: id, reading, updatedAt: at });
      return { id, reading };
    });
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).not.toBe(before.id);
    const after = await page.evaluate(async id => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id]?.reading, before.id);
    expect(after?.repetitionCount).toBe(action === 'Dismiss' ? 7 : 8);
    expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.reading, before.id)).toBeNull();
    await runPaletteHistoryCommand(page, `Undo ${action} Topic`);
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(before.id);
    expect(await page.evaluate(async id => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id]?.reading, before.id)).toEqual(before.reading);
    await runPaletteHistoryCommand(page, `Redo ${action} Topic`);
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).not.toBe(before.id);
    await page.reload(); await expectWorkspaceShell(page);
    expect(await page.evaluate(async id => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id]?.reading, before.id)).toEqual(after);
    expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.reading, before.id)).toBeNull();
    await page.screenshot({ path: path.resolve(`.tmp/artifacts/T632/reading-${action.toLowerCase()}-database.png`) });
  });
}
