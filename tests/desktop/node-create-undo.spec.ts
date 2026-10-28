import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { focusWorkspace } from './harness/contextualContentHistory';
import { clickNativeHistoryCommand, readStructureHistory } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { waitForStartupGuidedSample } from './harness/startupGuidedSample';

test('creates a topic and preserves its identity through Undo, Redo and reload', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await waitForStartupGuidedSample(desktopWindow);
  const activeId = () => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId());
  const before = await activeId();
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(activeId).not.toBe(before);
  const createdId = await activeId();
  expect(createdId).toBeTruthy();
  const isTrashed = () => desktopWindow.evaluate((id) =>
    window.__folioleWorkspaceDebug!.getNode(id!)?.trashed ?? null, createdId);
  await expect.poll(async () => (await readStructureHistory(desktopWindow))?.undoStack.at(-1)?.type)
    .toBe('structure.create');
  await focusWorkspace(desktopWindow);
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.undo');
  await expect.poll(isTrashed).toBe(true);
  await focusWorkspace(desktopWindow);
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.redo');
  await expect.poll(isTrashed).toBe(false);
  await expect.poll(activeId).toBe(createdId);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await expect.poll(isTrashed).toBe(false);
  const screenshot = path.resolve('.tmp/artifacts/T548/create-undo-redo.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
});
