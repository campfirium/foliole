import { beforeEach, expect, it } from 'vitest';

import { INBOX_NODE_ID, isInboxNode, isVirtualRootNode, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { NODE_TITLE_MAX_CHARS } from '../shared/config/nodeTitleConfig';

import {
  createInitialWorkspaceState,
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  RIGHT_SIDEBAR_WIDTH_DEFAULT,
  useWorkspaceStore
} from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('creates seed node as initial state', () => {
  const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

  expect(initial.activeNodeId).toBe('node-1');
  expect(initial.nodeOrder).toEqual([INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'node-1']);
  expect(isInboxNode(initial.nodesById[INBOX_NODE_ID])).toBe(true);
  expect(isVirtualRootNode(initial.nodesById[VIRTUAL_ROOT_NODE_ID])).toBe(true);
  expect(initial.nodesById[INBOX_NODE_ID]?.parentNodeId).toBeNull();
  expect(initial.nodesById[VIRTUAL_ROOT_NODE_ID]?.parentNodeId).toBeNull();
  expect(initial.nodesById['node-1']?.parentNodeId).toBeNull();
  expect(initial.nodesById['node-1']?.review).toBeNull();
  expect(initial.layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
  expect(initial.layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  expect(initial.layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
  expect(initial.layout.isListCollapsed).toBe(false);
  expect(initial.layout.isRightSidebarCollapsed).toBe(false);
});

it('updates node content and title', () => {
  useWorkspaceStore.getState().updateNodeContent('node-1', 'updated markdown');

  const node = useWorkspaceStore.getState().nodesById['node-1'];
  expect(node?.content).toBe('updated markdown');
  expect(node?.title).toBe('updated markdown');
});

it('updates reveal only for qa nodes', () => {
  useWorkspaceStore.getState().createQANodeFromSelection('node-1', 'Prompt [...]', 'answer');
  const qaNodeId = useWorkspaceStore
    .getState()
    .nodeOrder.find((nodeId) => nodeId !== 'node-1' && nodeId !== INBOX_NODE_ID && nodeId !== VIRTUAL_ROOT_NODE_ID);

  expect(qaNodeId).toBeTruthy();
  if (!qaNodeId) {
    throw new Error('expected QA node id');
  }

  useWorkspaceStore.getState().updateNodeReveal(qaNodeId, 'updated answer');
  useWorkspaceStore.getState().updateNodeReveal('node-1', 'ignored');

  expect(useWorkspaceStore.getState().nodesById[qaNodeId]?.reveal).toBe('updated answer');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.reveal).toBeNull();
});

it('derives title from normalized markdown content', () => {
  useWorkspaceStore.getState().updateNodeContent('node-1', '# New Title\n\nBody paragraph.');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('New Title');
});

it('keeps full normalized sentence in derived title', () => {
  useWorkspaceStore
    .getState()
    .updateNodeContent('node-1', 'First clause, second clause. Third sentence.');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe(
    'First clause, second clause. Third sentence.'
  );
});

it('does not include anchor tags in derived title', () => {
  useWorkspaceStore
    .getState()
    .updateNodeContent('node-1', '# Intro <cloze id="1">answer</cloze id="1">');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Intro answer');
});

it('applies fixed title max length from config', () => {
  const longContent = `# ${'x'.repeat(NODE_TITLE_MAX_CHARS + 20)}`;
  useWorkspaceStore.getState().updateNodeContent('node-1', longContent);

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe(
    'x'.repeat(NODE_TITLE_MAX_CHARS)
  );
});

it('uses Untitled when content has no usable text', () => {
  useWorkspaceStore.getState().updateNodeContent('node-1', ' \n\t  ');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Untitled');
});

it('keeps manual title when content changes after rename', () => {
  useWorkspaceStore.getState().updateNodeTitle('node-1', 'Manual Title');
  useWorkspaceStore.getState().updateNodeContent('node-1', '# Auto Title\nBody');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Title');
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
  const createdId = useWorkspaceStore
    .getState()
    .createQANodeFromSelection('node-1', 'What is [...]?', 'quoted text');

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected QA node id');
  }

  const createdNode = useWorkspaceStore.getState().nodesById[createdId];
  expect(createdNode?.parentNodeId).toBe('node-1');
  expect(createdNode?.kind).toBe('item');
  expect(createdNode?.title).toBe('What is [...]?');
  expect(createdNode?.content).toBe('What is [...]?');
  expect(createdNode?.reveal).toBe('quoted text');
  expect(createdNode?.review).not.toBeNull();
});

it('creates highlight node from selected content', () => {
  const createdId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection('node-1', 'selected text');

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected highlight node id');
  }

  const createdNode = useWorkspaceStore.getState().nodesById[createdId];
  expect(createdNode?.parentNodeId).toBe('node-1');
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
  const createdId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection('node-1', 'selected text');

  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected created node id');
  }

  useWorkspaceStore.getState().setActiveNode(createdId);
  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById[createdId]).toBeDefined();
  expect(useWorkspaceStore.getState().trashedNodeIds).toContain(createdId);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
});

it('removes matching anchor tags from parent when deleting linked child node', () => {
  const parentContent =
    'before <cloze id="1">answer</cloze id="1"> and <highlight id="2">keep</highlight id="2"> after';
  useWorkspaceStore.getState().updateNodeContent('node-1', parentContent);

  const createdId = useWorkspaceStore
    .getState()
    .createQANodeFromSelection('node-1', 'Prompt [...]', 'answer', '1');
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected QA node');
  }

  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe(
    'before answer and <highlight id="2">keep</highlight id="2"> after'
  );
});

it('keeps parent content unchanged when deleting unlinked child node', () => {
  const parentContent = 'before <highlight id="1">text</highlight id="1"> after';
  useWorkspaceStore.getState().updateNodeContent('node-1', parentContent);

  const createdId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection('node-1', 'text');
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected highlight node');
  }

  useWorkspaceStore.getState().deleteNode(createdId);

  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe(parentContent);
});

it('updates layout widths and resets to defaults', () => {
  useWorkspaceStore.getState().setListWidth(1200);
  useWorkspaceStore.getState().setDocumentMaxWidth(2400);
  useWorkspaceStore.getState().setRightSidebarWidth(420);
  useWorkspaceStore.getState().setListCollapsed(true);
  useWorkspaceStore.getState().setRightSidebarCollapsed(true);

  expect(useWorkspaceStore.getState().layout.listWidth).toBe(1200);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(2400);
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBe(420);
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);

  useWorkspaceStore.getState().resetLayout();
  expect(useWorkspaceStore.getState().layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
});

it('hydrates sidebar collapsed flags from persisted app settings', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.listCollapsed, 'true');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed, 'true');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.listWidth, '512');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.documentWidth, '1024');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth, '448');

  const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

  expect(initial.layout.isListCollapsed).toBe(true);
  expect(initial.layout.isRightSidebarCollapsed).toBe(true);
  expect(initial.layout.listWidth).toBe(512);
  expect(initial.layout.documentMaxWidth).toBe(1024);
  expect(initial.layout.rightSidebarWidth).toBe(448);
});
