import { beforeEach, expect, it, vi } from 'vitest';

import {
  HOME_NODE_ID,
  INBOX_NODE_ID,
  isHomeNode,
  isInboxNode,
  isVirtualRootNode,
  VIRTUAL_ROOT_NODE_ID
} from '../features/nodes/model/specialNodes';
import { NODE_TITLE_MAX_CHARS } from '../shared/config/nodeTitleConfig';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import {
  createInitialWorkspaceState,
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  RIGHT_SIDEBAR_WIDTH_DEFAULT,
  useWorkspaceStore
} from './workspaceStore';
import { createClozeLocator, createHighlightLocator } from './workspaceStoreNodeActions.test-support';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

async function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
  (await useWorkspaceStore.getState().createRootNode(''))!;
}

function getSeedNodeId() {
  const state = useWorkspaceStore.getState();
  const activeNode = state.activeNodeId ? state.nodesById[state.activeNodeId] : null;
  const seedNodeId = activeNode && !activeNode.specialKind
    ? state.activeNodeId
    : state.nodeOrder.find((nodeId) => {
      const node = state.nodesById[nodeId];
      return node && !node.specialKind;
    });
  if (!seedNodeId) {
    throw new Error('missing seed node');
  }
  return seedNodeId;
}

beforeEach(async () => {
  localStorage.clear();
  delete window.electronAPI;
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  await resetWorkspaceStore();
});

it('creates an empty initial state with only special roots', async () => {
  const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

  expect(initial.activeNodeId).toBeNull();
  expect(initial.browseRootNodeId).toBe(HOME_NODE_ID);
  expect(initial.nodeOrder).toEqual([HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
  expect(isHomeNode(initial.nodesById[HOME_NODE_ID])).toBe(true);
  expect(isInboxNode(initial.nodesById[INBOX_NODE_ID])).toBe(true);
  expect(isVirtualRootNode(initial.nodesById[VIRTUAL_ROOT_NODE_ID])).toBe(true);
  expect(initial.nodesById[INBOX_NODE_ID]?.parentNodeId).toBeNull();
  expect(initial.nodesById[VIRTUAL_ROOT_NODE_ID]?.parentNodeId).toBeNull();
  expect(initial.nodesById['node-1']!).toBeUndefined();
  expect(initial.layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
  expect(initial.layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  expect(initial.layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
  expect(initial.layout.isListCollapsed).toBe(false);
  expect(initial.layout.isRightSidebarCollapsed).toBe(false);
});

it('updates node content without refreshing the automatic title while typing', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'updated markdown');

  const node = useWorkspaceStore.getState().nodesById[seedNodeId];
  expect(node?.content).toBe('updated markdown');
  expect(node?.title).toBe('Untitled');
});

it('updates reveal only for qa nodes', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore
    .getState()
    .createQANodeFromSelection(seedNodeId, 'Prompt [...]', 'answer', 'cloze-1', createClozeLocator('cloze-1', 'answer'));
  const qaNodeId = useWorkspaceStore
    .getState()
    .nodeOrder.find((nodeId) => useWorkspaceStore.getState().nodesById[nodeId]?.parentNodeId === seedNodeId);

  expect(qaNodeId).toBeTruthy();
  if (!qaNodeId) {
    throw new Error('expected QA node id');
  }

  await useWorkspaceStore.getState().updateNodeReveal(qaNodeId, 'updated answer');
  await useWorkspaceStore.getState().updateNodeReveal(seedNodeId, 'ignored');

  expect(useWorkspaceStore.getState().nodesById[qaNodeId]?.reveal).toBe('updated answer');
  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.reveal).toBeNull();
});

it('derives title from normalized markdown content', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, '# New Title\n\nBody paragraph.');
  await useWorkspaceStore.getState().updateNodeDerivedTitle(seedNodeId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('New Title');
});

it('keeps full normalized sentence in derived title', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore
    .getState()
    .updateNodeContent(seedNodeId, 'First clause, second clause. Third sentence.');
  await useWorkspaceStore.getState().updateNodeDerivedTitle(seedNodeId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe(
    'First clause, second clause. Third sentence.'
  );
});

it('derives title from plain markdown content without extra cleanup branches', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore
    .getState()
    .updateNodeContent(seedNodeId, '# Intro answer');
  await useWorkspaceStore.getState().updateNodeDerivedTitle(seedNodeId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('Intro answer');
});

it('applies fixed title max length from config', async () => {
  const seedNodeId = getSeedNodeId();
  const longContent = `# ${'x'.repeat(NODE_TITLE_MAX_CHARS + 20)}`;
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, longContent);
  await useWorkspaceStore.getState().updateNodeDerivedTitle(seedNodeId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe(
    'x'.repeat(NODE_TITLE_MAX_CHARS)
  );
});

it('uses Untitled when content has no usable text', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, ' \n\t  ');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('Untitled');
});

it('syncs a unique body H1 over a manual title when content changes after rename', async () => {
  const seedNodeId = getSeedNodeId();
  await useWorkspaceStore.getState().updateNodeTitle(seedNodeId, 'Manual Title');
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, '# Auto Title\nBody');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('Auto Title');
});

it('keeps empty parent topics editable after they gain child nodes', async () => {
  const parentId = (await useWorkspaceStore.getState().createRootNode(''))!;
  (await useWorkspaceStore.getState().createChildNode(parentId, 'Child body'))!;

  await useWorkspaceStore.getState().updateNodeContent(parentId, 'Parent topic content');

  expect(useWorkspaceStore.getState().nodesById[parentId]?.content).toBe('Parent topic content');
});

it('keeps article parents editable after they gain child nodes', async () => {
  const parentId = (await useWorkspaceStore.getState().createRootNode('Parent article'))!;
  (await useWorkspaceStore.getState().createChildNode(parentId, 'Child body'))!;

  await useWorkspaceStore.getState().updateNodeContent(parentId, 'Parent article updated');

  expect(useWorkspaceStore.getState().nodesById[parentId]?.content).toBe('Parent article updated');
});

it('creates QA node from selected content', async () => {
  const seedNodeId = getSeedNodeId();
  const createdId = await useWorkspaceStore
    .getState()
    .createQANodeFromSelection(seedNodeId, 'What is [...]?', 'quoted text', 'cloze-2', createClozeLocator('cloze-2', 'quoted text'));

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected QA node id');
  }

  const createdNode = useWorkspaceStore.getState().nodesById[createdId];
  expect(createdNode?.parentNodeId).toBe(seedNodeId);
  expect(createdNode?.kind).toBe('item');
  expect(createdNode?.title).toBe('What is [...]?');
  expect(createdNode?.content).toBe('What is [...]?');
  expect(createdNode?.reveal).toBe('quoted text');
  expect(createdNode?.review).not.toBeNull();
});

it('creates highlight node from selected content', async () => {
  const seedNodeId = getSeedNodeId();
  const createdId = await useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection(seedNodeId, 'selected text', 'hl-1', createHighlightLocator('hl-1', 'selected text'));

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected highlight node id');
  }

  const createdNode = useWorkspaceStore.getState().nodesById[createdId];
  expect(createdNode?.parentNodeId).toBe(seedNodeId);
  expect(createdNode?.kind).toBe('topic');
  expect(createdNode?.title).toBe('selected text');
  expect(createdNode?.content).toBe('selected text');
  expect(createdNode?.reveal).toBeNull();
  expect(createdNode?.review).toBeNull();
});

it('creates global topics inside Inbox', async () => {
  const createdId = (await useWorkspaceStore.getState().createRootNode('Pasted content'))!;

  expect(createdId).toBeTruthy();
  expect(useWorkspaceStore.getState().activeNodeId).toBe(createdId);
  expect(useWorkspaceStore.getState().nodesById[createdId]?.parentNodeId).toBe(INBOX_NODE_ID);
  expect(useWorkspaceStore.getState().nodesById[createdId]?.content).toBe('Pasted content');
});

it('creates empty global topics inside Inbox', async () => {
  const createdId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[createdId]?.parentNodeId).toBe(INBOX_NODE_ID);
  expect(useWorkspaceStore.getState().nodesById[createdId]?.content).toBe('');
  expect(useWorkspaceStore.getState().nodesById[createdId]?.title).toBe('Untitled 1');
});

it('keeps only folders as root nodes for explicit folder-topic-item kinds', async () => {
  const folderId = (await useWorkspaceStore.getState().createRootNode('', 'folder'))!;
  const topicId = (await useWorkspaceStore.getState().createRootNode('', 'topic'))!;
  const itemId = (await useWorkspaceStore.getState().createRootNode('', 'item'))!;

  expect(useWorkspaceStore.getState().nodesById[folderId]?.kind).toBe('folder');
  expect(useWorkspaceStore.getState().nodesById[folderId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodesById[topicId]?.kind).toBe('topic');
  expect(useWorkspaceStore.getState().nodesById[topicId]?.parentNodeId).toBe(INBOX_NODE_ID);
  expect(useWorkspaceStore.getState().nodesById[itemId]?.kind).toBe('item');
  expect(useWorkspaceStore.getState().nodesById[itemId]?.parentNodeId).toBe(INBOX_NODE_ID);
});

it('blocks creating folder children under topics', async () => {
  const topicId = (await useWorkspaceStore.getState().createRootNode('Topic', 'topic'))!;
  const beforeOrder = [...useWorkspaceStore.getState().nodeOrder];

  const childId = (await useWorkspaceStore.getState().createChildNode(topicId, '', 'folder'))!;

  expect(useWorkspaceStore.getState().nodesById[childId]).toBeUndefined();
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(beforeOrder);
});

it('deletes node and switches active node', async () => {
  const seedNodeId = getSeedNodeId();
  const createdId = await useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection(seedNodeId, 'selected text', 'hl-2', createHighlightLocator('hl-2', 'selected text'));

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected created node id');
  }

  useWorkspaceStore.getState().setActiveNode(createdId);
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async (_command, payload?: { nodeIds?: string[] }) => ({
    deletedNodeIds: payload?.nodeIds ?? []
  })));
  await useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[createdId]).toBeDefined();
  expect(useWorkspaceStore.getState().trashedNodeIds).toContain(createdId);
  expect(useWorkspaceStore.getState().activeNodeId).toBe(seedNodeId);
});

it('keeps parent content unchanged during soft delete', async () => {
  const seedNodeId = getSeedNodeId();
  const parentContent = 'before answer and keep after';
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, parentContent);

  const createdId = await useWorkspaceStore
    .getState()
    .createQANodeFromSelection(seedNodeId, 'Prompt [...]', 'answer', '1', { id: '1', kind: 'cloze' });
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected QA node');
  }

  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.content).toBe(parentContent);
});

it('keeps parent content unchanged when deleting unlinked child node', async () => {
  const seedNodeId = getSeedNodeId();
  const parentContent = 'before text after';
  await useWorkspaceStore.getState().updateNodeContent(seedNodeId, parentContent);

  const createdId = await useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection(seedNodeId, 'text', 'hl-3', createHighlightLocator('hl-3', 'text'));
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected highlight node');
  }

  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.content).toBe(parentContent);
});
