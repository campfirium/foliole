import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const POISONED_TITLE = 'Untitled 1123123123';
const SCREENSHOT = path.resolve('.tmp/artifacts/untitled-sequence-hidden-native.png');

test('manual Untitled-style titles do not poison later generated titles', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));

  const manualId = await desktopWindow.evaluate(async () =>
    window.__folioleWorkspaceDebug?.createRootNode?.('', 'topic') ?? null
  );
  expect(manualId).toBeTruthy();
  expect(await desktopWindow.evaluate(([nodeId, title]) =>
    window.__folioleWorkspaceDebug?.updateNodeTitle?.(nodeId!, title!) ?? false,
  [manualId, POISONED_TITLE])).toBe(true);

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));

  const createdId = await desktopWindow.evaluate(async () =>
    window.__folioleWorkspaceDebug?.createRootNode?.('', 'topic') ?? null
  );
  expect(createdId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId!)?.title ?? null, createdId
  )).toBe('Untitled');

  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT });
  await testInfo.attach('untitled-sequence-hidden-native', { contentType: 'image/png', path: SCREENSHOT });
});
