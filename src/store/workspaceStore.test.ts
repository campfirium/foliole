import { beforeEach, expect, it } from 'vitest';

import { INBOX_NODE_ID, isInboxNode, isVirtualRootNode, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';
import { NODE_TITLE_MAX_CHARS } from '../shared/config/nodeTitleConfig';

import {
  createInitialWorkspaceState,
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  RIGHT_SIDEBAR_WIDTH_DEFAULT,
  useWorkspaceStore
} from './workspaceStore';
import { createClozeLocator, createHighlightLocator } from './workspaceStoreNodeActions.test-support';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
  useWorkspaceStore.getState().createRootNode('');
}

function getSeedNodeId() {
  const seedNodeId = useWorkspaceStore
    .getState()
    .nodeOrder.find((nodeId) => nodeId !== INBOX_NODE_ID && nodeId !== VIRTUAL_ROOT_NODE_ID);
  if (!seedNodeId) {
    throw new Error('missing seed node');
  }
  return seedNodeId;
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('creates an empty initial state with only special roots', () => {
  const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

  expect(initial.activeNodeId).toBeNull();
  expect(initial.nodeOrder).toEqual([INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
  expect(isInboxNode(initial.nodesById[INBOX_NODE_ID])).toBe(true);
  expect(isVirtualRootNode(initial.nodesById[VIRTUAL_ROOT_NODE_ID])).toBe(true);
  expect(initial.nodesById[INBOX_NODE_ID]?.parentNodeId).toBeNull();
  expect(initial.nodesById[VIRTUAL_ROOT_NODE_ID]?.parentNodeId).toBeNull();
  expect(initial.nodesById['node-1']).toBeUndefined();
  expect(initial.layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
  expect(initial.layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  expect(initial.layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
  expect(initial.layout.isListCollapsed).toBe(false);
  expect(initial.layout.isRightSidebarCollapsed).toBe(false);
});

it('updates node content and title', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'updated markdown');

  const node = useWorkspaceStore.getState().nodesById[seedNodeId];
  expect(node?.content).toBe('updated markdown');
  expect(node?.title).toBe('updated markdown');
});

it('updates reveal only for qa nodes', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore
    .getState()
    .createQANodeFromSelection(seedNodeId, 'Prompt [...]', 'answer', 'cloze-1', createClozeLocator('cloze-1', 'answer'));
  const qaNodeId = useWorkspaceStore
    .getState()
    .nodeOrder.find((nodeId) => nodeId !== seedNodeId && nodeId !== INBOX_NODE_ID && nodeId !== VIRTUAL_ROOT_NODE_ID);

  expect(qaNodeId).toBeTruthy();
  if (!qaNodeId) {
    throw new Error('expected QA node id');
  }

  useWorkspaceStore.getState().updateNodeReveal(qaNodeId, 'updated answer');
  useWorkspaceStore.getState().updateNodeReveal(seedNodeId, 'ignored');

  expect(useWorkspaceStore.getState().nodesById[qaNodeId]?.reveal).toBe('updated answer');
  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.reveal).toBeNull();
});

it('derives title from normalized markdown content', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, '# New Title\n\nBody paragraph.');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('New Title');
});

it('keeps full normalized sentence in derived title', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore
    .getState()
    .updateNodeContent(seedNodeId, 'First clause, second clause. Third sentence.');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe(
    'First clause, second clause. Third sentence.'
  );
});

it('does not include anchor tags in derived title', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore
    .getState()
    .updateNodeContent(seedNodeId, '# Intro <cloze id="1">answer</cloze id="1">');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('Intro answer');
});

it('applies fixed title max length from config', () => {
  const seedNodeId = getSeedNodeId();
  const longContent = `# ${'x'.repeat(NODE_TITLE_MAX_CHARS + 20)}`;
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, longContent);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe(
    'x'.repeat(NODE_TITLE_MAX_CHARS)
  );
});

it('uses Untitled when content has no usable text', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, ' \n\t  ');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('Untitled');
});

it('keeps manual title when content changes after rename', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeTitle(seedNodeId, 'Manual Title');
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, '# Auto Title\nBody');

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.title).toBe('Manual Title');
});

it('blocks content edits for empty container nodes after they gain child nodes', () => {
  const parentId = useWorkspaceStore.getState().createRootNode('');
  useWorkspaceStore.getState().createChildNode(parentId, 'Child body');

  useWorkspaceStore.getState().updateNodeContent(parentId, 'Container text should stay blocked');

  expect(useWorkspaceStore.getState().nodesById[parentId]?.content).toBe('');
});

it('keeps article parents editable after they gain child nodes', () => {
  const parentId = useWorkspaceStore.getState().createRootNode('Parent article');
  useWorkspaceStore.getState().createChildNode(parentId, 'Child body');

  useWorkspaceStore.getState().updateNodeContent(parentId, 'Parent article updated');

  expect(useWorkspaceStore.getState().nodesById[parentId]?.content).toBe('Parent article updated');
});

it('restores content editing after an empty container loses all child nodes', () => {
  const parentId = useWorkspaceStore.getState().createRootNode('');
  const childId = useWorkspaceStore.getState().createChildNode(parentId, 'Child body');

  useWorkspaceStore.getState().deleteNode(childId);
  useWorkspaceStore.getState().updateNodeContent(parentId, 'Recovered content');

  expect(useWorkspaceStore.getState().nodesById[parentId]?.content).toBe('Recovered content');
});

it('creates QA node from selected content', () => {
  const seedNodeId = getSeedNodeId();
  const createdId = useWorkspaceStore
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

it('creates highlight node from selected content', () => {
  const seedNodeId = getSeedNodeId();
  const createdId = useWorkspaceStore
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

it('creates root node when workspace is empty', () => {
  useWorkspaceStore.setState({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {}
  });

  const createdId = useWorkspaceStore.getState().createRootNode('Pasted content');

  expect(createdId).toBeTruthy();
  expect(useWorkspaceStore.getState().activeNodeId).toBe(createdId);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([createdId]);
  expect(useWorkspaceStore.getState().nodesById[createdId]?.content).toBe('Pasted content');
});

it('creates empty root node for explicit new note action', () => {
  useWorkspaceStore.setState({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {}
  });

  const createdId = useWorkspaceStore.getState().createRootNode();

  expect(useWorkspaceStore.getState().nodesById[createdId]?.content).toBe('');
  expect(useWorkspaceStore.getState().nodesById[createdId]?.title).toBe('Untitled');
});

it('creates root nodes with explicit folder-topic-item kinds', () => {
  useWorkspaceStore.setState({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {}
  });

  const folderId = useWorkspaceStore.getState().createRootNode('', 'folder');
  const topicId = useWorkspaceStore.getState().createRootNode('', 'topic');
  const itemId = useWorkspaceStore.getState().createRootNode('', 'item');

  expect(useWorkspaceStore.getState().nodesById[folderId]?.kind).toBe('folder');
  expect(useWorkspaceStore.getState().nodesById[topicId]?.kind).toBe('topic');
  expect(useWorkspaceStore.getState().nodesById[itemId]?.kind).toBe('item');
});

it('blocks creating folder children under topics', () => {
  const topicId = useWorkspaceStore.getState().createRootNode('Topic', 'topic');
  const beforeOrder = [...useWorkspaceStore.getState().nodeOrder];

  const childId = useWorkspaceStore.getState().createChildNode(topicId, '', 'folder');

  expect(useWorkspaceStore.getState().nodesById[childId]).toBeUndefined();
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(beforeOrder);
});

it('deletes node and switches active node', () => {
  const seedNodeId = getSeedNodeId();
  const createdId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection(seedNodeId, 'selected text', 'hl-2', createHighlightLocator('hl-2', 'selected text'));

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected created node id');
  }

  useWorkspaceStore.getState().setActiveNode(createdId);
  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[createdId]).toBeDefined();
  expect(useWorkspaceStore.getState().trashedNodeIds).toContain(createdId);
  expect(useWorkspaceStore.getState().activeNodeId).toBe(seedNodeId);
});

it('keeps linked anchor tags in parent content during soft delete', () => {
  const seedNodeId = getSeedNodeId();
  const parentContent =
    'before <cloze id="1">answer</cloze id="1"> and <highlight id="2">keep</highlight id="2"> after';
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, parentContent);

  const createdId = useWorkspaceStore
    .getState()
    .createQANodeFromSelection(seedNodeId, 'Prompt [...]', 'answer', '1', { id: '1', kind: 'cloze' });
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected QA node');
  }

  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.content).toBe(parentContent);
});

it('keeps parent content unchanged when deleting unlinked child node', () => {
  const seedNodeId = getSeedNodeId();
  const parentContent = 'before <highlight id="1">text</highlight id="1"> after';
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, parentContent);

  const createdId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection(seedNodeId, 'text', 'hl-3', createHighlightLocator('hl-3', 'text'));
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected highlight node');
  }

  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[seedNodeId]?.content).toBe(parentContent);
});
