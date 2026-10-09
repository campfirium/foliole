import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type WindowPage = DesktopSession['firstWindow'];
const BASE = 'Apples\nBread\nMilk\n';
const REMOTE = 'Apples\nBread\nMilk and coffee\n';
const LOCAL = `Fresh ${BASE}`;

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

async function openEditor(page: WindowPage, nodeId: string) {
  const exitFlow = page.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode(id), nodeId);
  await expect(page.locator('.prompt-editor-host .cm-content')).toHaveAttribute('contenteditable', 'true');
}

async function alternativeBodies(page: WindowPage, nodeId: string) {
  return page.evaluate(async (id) => {
    const preview = await window.electronAPI?.invoke('load_node_text_alternative_preview', { node_id: id });
    return preview ? [preview.current_content, preview.updated_content].sort() : [];
  }, nodeId);
}

async function persistedBranches(session: DesktopSession, nodeId: string) {
  return session.electronApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite: db, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('foliole-playwright')) throw new Error('Expected an isolated test library');
      return { node: db.prepare('SELECT current_version_id, content FROM nodes WHERE id = ?').get(id),
        versions: db.prepare('SELECT version_id, parent_version_id, body_text, snapshot_json FROM node_sync_versions WHERE object_id = ?').all(id),
        holds: db.prepare('SELECT * FROM node_version_local_holds').all() };
    });
  }, nodeId);
}

test('preserves late editor input as a whole alternative and survives continued editing and reload', async ({ desktopWindow, desktopSession }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const nodeId = 'playwright-concurrent-editor';
  await desktopWindow.evaluate(async (id) => {
    await window.__folioleWorkspaceDebug?.seedNodes([{ id, content: 'Apples\nBread\nMilk\n', kind: 'topic', title: 'Concurrent editor' }], { persist: true });
  }, nodeId);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await openEditor(desktopWindow, nodeId);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(nodeId);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(BASE);
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
  await expect.poll(() => persistedContent(desktopWindow, nodeId)).toBe(REMOTE);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(nodeId);
  await flush(desktopWindow);
  await testInfo.attach('saved-version-branches', { body: JSON.stringify(await persistedBranches(desktopSession, nodeId)), contentType: 'application/json' });
  await expect.poll(() => alternativeBodies(desktopWindow, nodeId)).toEqual([REMOTE, LOCAL].sort());
  const current = await persistedContent(desktopWindow, nodeId);
  if (typeof current !== 'string') throw new Error('Expected a saved current body');
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(current);

  await insertText(desktopWindow, 'Continued\n', current.length);
  await flush(desktopWindow);
  const expected = `${current}Continued\n`;
  await expect.poll(() => persistedContent(desktopWindow, nodeId)).toBe(expected);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await openEditor(desktopWindow, nodeId);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(expected);
  const other = current === REMOTE ? LOCAL : REMOTE;
  await expect.poll(() => alternativeBodies(desktopWindow, nodeId)).toEqual([expected, other].sort());
  await testInfo.attach('confirmed-edit-after-reload', { body: Buffer.from(expected), contentType: 'text/plain' });
});


test('reopens a complete BOM and CRLF article with its author and collection metadata', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const nodeId = 'playwright-crlf-article';
  const body = '\ufeff---\r\nauthor: Ada\r\ncollections:\r\n  - "Guide"\r\n---\r\nComplete article 中😀\r\n';
  await desktopWindow.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes([{ id, content, kind: 'topic', title: 'CRLF article' }], { persist: true });
  }, { id: nodeId, content: body });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await openEditor(desktopWindow, nodeId);
  await expect.poll(() => persistedContent(desktopWindow, nodeId)).toBe(body);
  const snapshot = await desktopWindow.evaluate(() => window.electronAPI?.invoke('load_workspace_list_snapshot'));
  expect(snapshot?.nodesById[nodeId]).toMatchObject({ authorText: 'Ada', collections: ['Guide'] });
  expect(snapshot?.nodesById[nodeId]?.currentVersionId).toBeTruthy();
});
