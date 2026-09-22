import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_ID = 't239-large-folder';
const TOPIC_COUNT = 300;

async function openNode(desktopWindow: Parameters<typeof expectWorkspaceShell>[0], nodeId: string) {
  await desktopWindow.evaluate(async (targetNodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId);
  }, nodeId);
}

async function readNodeContent(
  desktopWindow: Parameters<typeof expectWorkspaceShell>[0],
  nodeId: string
) {
  return desktopWindow.evaluate((targetNodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.content ?? null,
  nodeId);
}

test('reclaims large-folder bodies and reopens warm and evicted documents', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ folderId, topicCount }) => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([
      { content: 'Folder body', id: folderId, kind: 'folder', title: 'T239 Large Folder' },
      ...Array.from({ length: topicCount }, (_, index) => ({
        content: `T239 body ${index + 1}`,
        id: `t239-topic-${index + 1}`,
        kind: 'topic' as const,
        parentNodeId: folderId,
        title: `T239 Topic ${index + 1}`
      }))
    ]);
  }, { folderId: FOLDER_ID, topicCount: TOPIC_COUNT });

  const loadedBodyCount = await desktopWindow.evaluate((topicCount) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return Array.from({ length: topicCount }, (_, index) =>
      api?.getNode?.(`t239-topic-${index + 1}`)?.content ?? '')
      .filter(Boolean).length;
  }, TOPIC_COUNT);
  expect(loadedBodyCount).toBeLessThanOrEqual(2);
  expect(await readNodeContent(desktopWindow, 't239-topic-3')).toBe('');

  await openNode(desktopWindow, 't239-topic-300');
  await expect.poll(() => readNodeContent(desktopWindow, 't239-topic-300')).toBe('T239 body 300');
  await openNode(desktopWindow, FOLDER_ID);
  await expect.poll(() => readNodeContent(desktopWindow, 't239-topic-300')).toBe('');

  await openNode(desktopWindow, 't239-topic-3');
  await expect.poll(() => readNodeContent(desktopWindow, 't239-topic-3')).toBe('T239 body 3');
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
  )).toContain('T239 body 3');
});
