import path from 'node:path';

import { collectNode } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const NODE_COUNT = 60;
const nodeIds = Array.from({ length: NODE_COUNT }, (_, index) => `empty-trash-topic-${index}`);

test('empties a large trash at once and keeps it empty after reload', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async (ids) => window.__folioleWorkspaceDebug?.seedNodes?.(ids.map((id, index) => ({
    content: `# Trash body ${index}\n\n${'Paragraph text. '.repeat(40)}`, id, kind: 'topic', title: `Trash topic ${index}`
  }))), nodeIds);
  for (const nodeId of nodeIds) {
    await desktopWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode?.(id), nodeId);
  }
  await expect.poll(() => collectNode(desktopWindow, nodeIds.at(-1)!)).toMatchObject({ trashed: true });

  await desktopWindow.getByRole('treeitem', { name: /^(Trash|回收站|废纸篓)$/ }).click();
  const emptyTrash = desktopWindow.getByRole('button', { name: /^(Empty trash|清空废纸篓)$/ });
  await expect(emptyTrash).toBeEnabled();
  await emptyTrash.click();

  // The rows leave the trash on click, before the runtime finishes deleting them.
  await expect.poll(() => collectNode(desktopWindow, nodeIds[0]), { timeout: 1_000 }).toBeNull();
  await expect(emptyTrash).toBeDisabled({ timeout: 1_000 });
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/desktop-acceptance/trash-empty-background.png') });

  await expect.poll(async () => (await loadNodeDocument(desktopWindow, nodeIds[0])) ?? null, { timeout: 30_000 })
    .toBeNull();
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  for (const nodeId of [nodeIds[0], nodeIds[NODE_COUNT / 2], nodeIds.at(-1)!]) {
    expect(await collectNode(desktopWindow, nodeId)).toBeNull();
  }
});
