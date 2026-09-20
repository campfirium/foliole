import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type WindowPage = DesktopSession['firstWindow'];
const BASE = 'Apples\nBread\nMilk\n';
const REMOTE = 'Apples\nBread\nMilk and coffee\n';
const MERGED = 'Fresh Apples\nBread\nMilk and coffee\n';

async function insertText(page: WindowPage, text: string, position: number) {
  await page.locator('.prompt-editor-host .cm-content').click();
  await expect.poll(() => page.evaluate((offset) =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', offset, offset) ?? false, position)).toBe(true);
  await page.keyboard.insertText(text);
}

async function flush(page: WindowPage) {
  expect(await page.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
}

async function persistedContent(page: WindowPage, nodeId: string) {
  return page.evaluate(async (id) =>
    (await window.electronAPI?.invoke('load_node_document', { nodeId: id }))?.content, nodeId);
}

test('merges late editor input with a competing persisted version and survives reload', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const previous = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId());
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).not.toBe(previous);
  const nodeId = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId()!);
  await insertText(desktopWindow, BASE, 0);
  await flush(desktopWindow);
  await expect.poll(() => persistedContent(desktopWindow, nodeId)).toBe(BASE);

  await insertText(desktopWindow, 'Fresh ', 0);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(`Fresh ${BASE}`);
  await desktopWindow.evaluate(async ({ id, content }) => {
    const api = window.electronAPI!;
    const snapshot = await api.invoke('load_workspace_snapshot');
    const node = snapshot!.nodesById[id]!;
    if (!node.currentVersionId) throw new Error('Expected a persisted baseline version');
    await api.invoke('update_node_content', {
      ...node,
      anchorLink: node.anchorLink ?? null,
      content,
      nodeId: id,
      position: node.position ?? null,
      updatedAt: new Date().toISOString()
    });
  }, { id: nodeId, content: REMOTE });
  await flush(desktopWindow);
  await expect.poll(() => persistedContent(desktopWindow, nodeId)).toBe(MERGED);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(MERGED);

  await insertText(desktopWindow, 'Continued\n', MERGED.length);
  await flush(desktopWindow);
  const expected = `${MERGED}Continued\n`;
  await expect.poll(() => persistedContent(desktopWindow, nodeId)).toBe(expected);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode(id), nodeId);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(expected);
  await testInfo.attach('confirmed-edit-after-reload', { body: Buffer.from(expected), contentType: 'text/plain' });
});
