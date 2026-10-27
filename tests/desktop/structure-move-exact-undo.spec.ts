import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { clickNativeHistoryCommand, readStructureHistory } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
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
