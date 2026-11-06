import { beforeEach, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createWorkspaceNodeActionsFixture } from '../../store/workspaceStoreNodeActions.test-support';

import { createPaletteCreationActions } from './appPaletteCreationActions';

function folder(id: string, specialKind?: 'home' | 'inbox' | 'virtual-root') {
  return { id, kind: 'folder', ...(specialKind ? { specialKind } : {}) };
}

function stubAnimationFrame() {
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
  return requestAnimationFrame;
}

function seedCreationState() {
  const initial = createWorkspaceNodeActionsFixture();
  initial.nodesById['node-new'] = { ...initial.nodesById['node-1']!, id: 'node-new' };
  initial.nodeOrder.push('node-new');
  useWorkspaceStore.setState({ ...initial, libraryScope: 'creation-test' });
}
async function createNode() {
  useWorkspaceStore.setState({ activeNodeId: 'node-new' });
  return 'node-new';
}

function creationFolders() {
  return {
    'folder-a': folder('folder-a'),
    [HOME_NODE_ID]: folder(HOME_NODE_ID, 'home'),
    [INBOX_NODE_ID]: folder(INBOX_NODE_ID, 'inbox'),
    [VIRTUAL_ROOT_NODE_ID]: folder(VIRTUAL_ROOT_NODE_ID, 'virtual-root')
  };
}

function createHarness(overrides: Record<string, unknown> = {}) {
  const focus = vi.fn();
  const closeTrashView = vi.fn();
  const closeExternalView = vi.fn();
  const closeVirtualView = vi.fn();
  const setBrowseRootNode = vi.fn();
  const setIsViewingTrashNode = vi.fn();
  seedCreationState();
  const createChildNode = vi.fn(createNode);
  const createRootNode = vi.fn(createNode);
  const requestAnimationFrame = stubAnimationFrame();
  const defaults = {
    externalView: { closeExternalView, isExternalViewOpen: false },
    layoutProps: {
      document: { editorAdapterRef: { current: { focus } } },
      navigation: { onSelectNodeInVirtualView: vi.fn() },
      virtualView: { onOpenVirtualView: vi.fn() }
    },
    runtime: { setIsViewingTrashNode },
    trash: { closeTrashView, isTrashViewOpen: false },
    virtualView: { closeVirtualView },
    ws: {
      browseRootNodeId: 'folder-a',
      createChildNode,
      createRootNode,
      createVirtualNode: vi.fn(),
      nodesById: creationFolders(),
      setBrowseRootNode,
      trashedNodeIds: []
    }
  };
  const args = {
    ...defaults,
    ...overrides,
    externalView: { ...defaults.externalView, ...(overrides.externalView as object | undefined) },
    runtime: { ...defaults.runtime, ...(overrides.runtime as object | undefined) },
    trash: { ...defaults.trash, ...(overrides.trash as object | undefined) },
    virtualView: { ...defaults.virtualView, ...(overrides.virtualView as object | undefined) },
    ws: { ...defaults.ws, ...(overrides.ws as object | undefined) }
  };
  const actions = createPaletteCreationActions(
    args as unknown as Parameters<typeof createPaletteCreationActions>[0]
  );
  return {
    actions,
    closeExternalView,
    closeTrashView,
    closeVirtualView,
    createChildNode,
    createRootNode,
    focus,
    requestAnimationFrame,
    setBrowseRootNode,
    setIsViewingTrashNode
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('creates a topic in the current ordinary folder and focuses its body', async () => {
  const harness = createHarness();

  await harness.actions.createTopic();

  expect(harness.createChildNode).toHaveBeenCalledWith('folder-a', '', 'topic');
  expect(harness.createRootNode).not.toHaveBeenCalled();
  expect(harness.setBrowseRootNode).not.toHaveBeenCalled();
  expect(harness.focus).toHaveBeenCalledOnce();
});

it('keeps Inbox creation on the existing Inbox-root path', async () => {
  const harness = createHarness({
    ws: { browseRootNodeId: INBOX_NODE_ID }
  });

  await harness.actions.createTopic();

  expect(harness.createChildNode).not.toHaveBeenCalled();
  expect(harness.createRootNode).toHaveBeenCalledWith('', 'topic');
  expect(harness.setBrowseRootNode).not.toHaveBeenCalled();
  expect(harness.focus).toHaveBeenCalledOnce();
});

it.each([
  ['Home', { browseRootNodeId: HOME_NODE_ID }],
  ['Virtual', { browseRootNodeId: VIRTUAL_ROOT_NODE_ID }],
  ['Trash', { trashOpen: true }],
  ['External', { externalOpen: true }],
  ['External over Inbox', { browseRootNodeId: INBOX_NODE_ID, externalOpen: true }]
])('creates from %s in Inbox and explicitly settles the Inbox view', async (_label, context) => {
  const harness = createHarness({
    externalView: { isExternalViewOpen: 'externalOpen' in context },
    trash: { isTrashViewOpen: 'trashOpen' in context },
    ws: {
      browseRootNodeId: 'browseRootNodeId' in context ? context.browseRootNodeId : 'folder-a'
    }
  });

  await harness.actions.createTopic();

  expect(harness.createRootNode).toHaveBeenCalledWith('', 'topic');
  expect(harness.createChildNode).not.toHaveBeenCalled();
  expect(harness.setBrowseRootNode).toHaveBeenCalledWith(INBOX_NODE_ID);
  expect(harness.setIsViewingTrashNode).toHaveBeenCalledWith(false);
  expect(harness.closeVirtualView).toHaveBeenCalledOnce();
  expect(harness.requestAnimationFrame).toHaveBeenCalledOnce();
  expect(harness.focus).toHaveBeenCalledOnce();
});

it('does not switch views, focus, or retry in Inbox when folder creation fails', async () => {
  const createChildNode = vi.fn(async () => null);
  const harness = createHarness({
    ws: {
      createChildNode,
      createRootNode: vi.fn(async () => 'unexpected')
    }
  });

  await harness.actions.createTopic();

  expect(createChildNode).toHaveBeenCalledOnce();
  expect(harness.setBrowseRootNode).not.toHaveBeenCalled();
  expect(harness.closeTrashView).not.toHaveBeenCalled();
  expect(harness.focus).not.toHaveBeenCalled();
});

it('keeps folder and item creation on their existing root path and exit timing', async () => {
  const harness = createHarness();

  const folderResult = harness.actions.createFolder();
  expect(harness.closeTrashView).toHaveBeenCalledOnce();
  await folderResult;
  await harness.actions.createItem();

  expect(harness.createRootNode).toHaveBeenNthCalledWith(1, '', 'folder');
  expect(harness.createRootNode).toHaveBeenNthCalledWith(2, '', 'item');
  expect(harness.focus).not.toHaveBeenCalled();
});


it.each(['keydown', 'pointerdown', 'node', 'library'])('does not restore creation focus after a later %s intent', async change => {
  let release!: () => void;
  const receipt = new Promise<void>(resolve => { release = resolve; });
  const createChildNode = vi.fn(async () => {
    useWorkspaceStore.setState({ activeNodeId: 'node-new' });
    await receipt;
    return 'node-new';
  });
  const harness = createHarness({ ws: { createChildNode } });
  const creating = harness.actions.createTopic();
  if (change === 'node') useWorkspaceStore.setState({ activeNodeId: 'node-1' });
  else if (change === 'library') useWorkspaceStore.setState({ libraryScope: 'other-library' });
  else document.dispatchEvent(change === 'keydown'
    ? new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    : new Event('pointerdown', { bubbles: true }));
  release();
  expect(await creating).toBe('node-new');
  expect(harness.focus).not.toHaveBeenCalled();
});


it('does not reclaim focus from Escape during the navigation frame', async () => {
  const harness = createHarness({ ws: { browseRootNodeId: HOME_NODE_ID } });
  let frame!: FrameRequestCallback;
  harness.requestAnimationFrame.mockImplementationOnce(callback => { frame = callback; return 1; });
  expect(await harness.actions.createTopic()).toBe('node-new');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  frame(0);
  expect(harness.focus).not.toHaveBeenCalled();
});

it('keeps the initiating keyboard command eligible to focus its new topic', async () => {
  const harness = createHarness();
  let creating!: Promise<string | null>;
  window.addEventListener('keydown', () => { creating = harness.actions.createTopic(); }, { capture: true, once: true });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
  expect(await creating).toBe('node-new');
  expect(harness.focus).toHaveBeenCalledOnce();
});

it('revokes late focus for a native Escape that never reaches DOM keydown', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI');
  const native = new Set<(input: { type: string; key: string }) => void>();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    onNativeKeyboardInput: (handler: (input: { type: string; key: string }) => void) => {
      native.add(handler); return () => { native.delete(handler); };
    }
  } });
  try {
    let release!: () => void;
    const receipt = new Promise<void>(resolve => { release = resolve; });
    const harness = createHarness({ ws: { createChildNode: async () => {
      useWorkspaceStore.setState({ activeNodeId: 'node-new' });
      await receipt;
      return 'node-new';
    } } });
    const creating = harness.actions.createTopic();
    for (const handler of native) handler({ type: 'keyDown', key: 'Escape' });
    release();
    await creating;
    expect(harness.focus).not.toHaveBeenCalled();
  } finally {
    if (descriptor) Object.defineProperty(window, 'electronAPI', descriptor);
    else Reflect.deleteProperty(window, 'electronAPI');
  }
});
