import { INBOX_NODE_ID } from '../../src/features/nodes/model/specialNodes';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_ID = 'wiki-link-source';
const TARGET_TITLE = 'My_draft';
const SOURCE_CONTENT = 'See [[My_draft|new topic]], [[my_draft]], and [[node-id:missing-topic|removed topic]].';

test('opens a missing named wiki link as a single new Inbox topic', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([{ id: 'wiki-source-folder', kind: 'folder', title: 'Source folder', content: '' },
      { id, kind: 'topic', parentNodeId: 'wiki-source-folder', title: 'Source topic', content }]);
    await api.openNode(id);
  }, { id: SOURCE_ID, content: SOURCE_CONTENT });

  const activeNodeId = () => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId());
  const link = (title: string) => page.locator('.prompt-editor-host [data-md-link-node-title]').filter({ hasText: title });
  const matches = () => page.evaluate(async title => {
    const { nodesById } = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Object.values(nodesById).filter(node => node.title.toLowerCase() === title.toLowerCase());
  }, TARGET_TITLE);

  await link('new topic').hover();
  await expect(page.locator('section[aria-label="Linked topic preview"], section[aria-label="链接主题预览"]')).toBeVisible();
  expect(await matches()).toEqual([]);

  await link('new topic').click();
  await expect.poll(activeNodeId).not.toBe(SOURCE_ID);
  await expect.poll(matches).toEqual([
    expect.objectContaining({ title: TARGET_TITLE, parentNodeId: INBOX_NODE_ID, kind: 'topic', content: '' })
  ]);
  const [target] = await matches();
  expect(await activeNodeId()).toBe(target!.id);

  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), SOURCE_ID);
  await link('my_draft').click();
  await expect.poll(activeNodeId).toBe(target!.id);
  expect(await matches()).toHaveLength(1);

  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), SOURCE_ID);
  await link('removed topic').click();
  expect(await activeNodeId()).toBe(SOURCE_ID);
  const source = await page.evaluate(id => window.electronAPI.invoke('load_node_document', { nodeId: id }), SOURCE_ID);
  expect(source?.content).toBe(SOURCE_CONTENT);
});
