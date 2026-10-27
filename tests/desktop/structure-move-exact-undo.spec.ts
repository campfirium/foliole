import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { clickNativeHistoryCommand, readStructureHistory } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

test('restores noncontiguous sibling positions through native Undo and Redo', async ({
  desktopApp, desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'move-parent', kind: 'folder', title: 'Move Parent', content: '' },
      ...['a', 'x', 'b', 'y'].map((id) => ({ id: `move-${id}`, parentNodeId: 'move-parent',
        kind: 'folder' as const, title: id.toUpperCase(), content: '' }))
    ]);
  });
  const order = () => desktopWindow.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug!;
    return debug.getWorkspaceStructureState().nodeOrder.filter((id) =>
      debug.getNode(id)?.parentNodeId === 'move-parent');
  });
  const before = ['move-a', 'move-x', 'move-b', 'move-y'];
  const after = ['move-x', 'move-y', 'move-a', 'move-b'];
  await expect.poll(order).toEqual(before);
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!
    .moveNodes(['move-a', 'move-b'], 'move-y', 'after'))).toBe(true);
  await expect.poll(order).toEqual(after);
  await expect.poll(async () => (await readStructureHistory(desktopWindow))?.undoStack.at(-1)?.type)
    .toBe('structure.move');
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.undo');
  await expect.poll(order).toEqual(before);
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.redo');
  await expect.poll(order).toEqual(after);
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.undo');
  await expect.poll(order).toEqual(before);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await expect.poll(order).toEqual(before);
  const evidence = path.resolve('.tmp/artifacts/T542/exact-move-undo.png');
  await mkdir(path.dirname(evidence), { recursive: true });
  await desktopWindow.screenshot({ path: evidence });
});

test('saves pending source content before maintaining reading during a cross-parent move', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    const profile = { intervalDurationMs: 1234, intervalGrowthFactor: 1.5, lastHandledAt: '2026-10-28T00:00:00.000Z',
      nextAt: '2026-10-28T00:00:00.000Z', priority: 5, readingPosition: 31, repetitionCount: 7 };
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'reading-source', kind: 'folder', title: 'Reading Source', content: '' },
      { id: 'reading-target', kind: 'folder', title: 'Reading Target', content: '' },
      { id: 'reading-one', parentNodeId: 'reading-source', kind: 'topic', title: 'One', content: 'First',
        reading: { ...profile, state: 'active' } },
      { id: 'reading-two', parentNodeId: 'reading-source', kind: 'topic', title: 'Two', content: '',
        reading: { ...profile, state: 'locked' } }
    ]);
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: 'reading-source', parentNodeId: null, kind: 'folder', title: 'Reading Source', content: '',
      isTitleManual: true, hideTitleHeading: false, reveal: null, anchorLink: null,
      sequentialReadingEnabled: true, reading: null,
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z'
    });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const result = await desktopWindow.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.openNode('reading-two');
    const edited = await debug.updateNodeContent('reading-two', 'Newly written content');
    const moved = await debug.moveNodes(['reading-one'], 'reading-target', 'child');
    return { edited, moved, reading: debug.getNode('reading-two')?.reading };
  });
  expect(result).toMatchObject({ edited: true, moved: true,
    reading: { state: 'active', readingPosition: 31, repetitionCount: 7 } });
  await expect.poll(async () => (await loadNodeDocument(desktopWindow, 'reading-two'))?.content)
    .toBe('Newly written content');
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getNode('reading-one')?.parentNodeId))
    .toBe('reading-target');
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getNode('reading-two')?.reading))
    .toMatchObject({ state: 'active', readingPosition: 31, repetitionCount: 7 });
});
