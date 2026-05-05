import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { App } from '../app/App';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import type { Node } from '../features/nodes/model/nodeTypes';
import {
  createInitialWorkspaceState,
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  useWorkspaceStore
} from '../store/workspaceStore';

const mockEditorState: { content: string; selectionFrom: number; selectionTo: number } = {
  content: '',
  selectionFrom: 0,
  selectionTo: 0
};

const mockEditorAdapter: EditorAdapter = {
  destroy: () => undefined,
  focus: () => undefined,
  getContent: () => mockEditorState.content,
  setContent: (content: string) => {
    mockEditorState.content = content;
  },
  getSelection: () => ({ from: mockEditorState.selectionFrom, to: mockEditorState.selectionTo }),
  revealSelection: (selection) => {
    mockEditorState.selectionFrom = selection.from;
    mockEditorState.selectionTo = selection.to;
  },
  setSelection: (selection) => {
    mockEditorState.selectionFrom = selection.from;
    mockEditorState.selectionTo = selection.to;
  },
  getScrollTop: () => 0,
  setScrollTop: () => undefined,
  replaceSelection: (content: string) => {
    const from = Math.min(mockEditorState.selectionFrom, mockEditorState.selectionTo);
    const to = Math.max(mockEditorState.selectionFrom, mockEditorState.selectionTo);
    mockEditorState.content = `${mockEditorState.content.slice(0, from)}${content}${mockEditorState.content.slice(to)}`;
    const nextCursor = from + content.length;
    mockEditorState.selectionFrom = nextCursor;
    mockEditorState.selectionTo = nextCursor;
  },
  onContentChange: () => () => undefined
};

vi.mock('../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: ({
    ariaLabel,
    value,
    onChange,
    onReady
  }: {
    ariaLabel?: string;
    value: string;
    onChange: (value: string) => void;
    onReady?: (adapter: EditorAdapter | null) => void;
  }) => {
    mockEditorState.content = value;
    onReady?.(mockEditorAdapter);
    return (
      <textarea
        aria-label={ariaLabel ?? 'Mock editor'}
        data-testid={ariaLabel === 'Answer editor' ? 'answer-editor-value' : 'editor-value'}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          mockEditorState.content = nextValue;
          onChange(nextValue);
        }}
        value={value}
      />
    );
  }
}));

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    localStorage.clear();
    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
    mockEditorState.content = '# Welcome to Foliole\n\nStart writing markdown here.';
    mockEditorState.selectionFrom = 0;
    mockEditorState.selectionTo = 0;
  });

  it('renders note list and single document panel', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Note' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Workspace toolbar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Node breadcrumbs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create QA Node' })).not.toBeInTheDocument();
  });

  it('loads selected node content into editor', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const qaNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'QA 2',
      content: 'Prompt [...]',
      reveal: 'Answer',
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...state.nodesById,
        'node-2': qaNode
      }
    }));

    render(<App />);

    expect(screen.getByTestId('editor-value')).toHaveValue('# Welcome to Foliole\n\nStart writing markdown here.');
    fireEvent.click(screen.getByRole('button', { name: 'QA 2' }));
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(screen.getByTestId('editor-value')).toHaveValue('Prompt [...]');
    expect(screen.getByLabelText('Cloze answer section')).toBeInTheDocument();
    expect(screen.getByTestId('answer-editor-value')).toHaveValue('Answer');
    expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('answer-editor-value'), {
      target: { value: 'Updated Answer' }
    });
    expect(useWorkspaceStore.getState().nodesById['node-2']?.reveal).toBe('Updated Answer');
  });

  it('supports ctrl/cmd multi-select and shift range select in node list', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const node2: Node = {
      id: 'node-2',
      parentNodeId: null,
      title: 'Node 2',
      content: '# Node 2',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const node3: Node = {
      id: 'node-3',
      parentNodeId: null,
      title: 'Node 3',
      content: '# Node 3',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': node2,
        'node-3': node3
      }
    }));

    render(<App />);

    const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
    const node1Button = within(listPanel).getByRole('button', { name: 'Welcome to Foliole Start writing markdown here.' });
    const node2Button = within(listPanel).getByRole('button', { name: 'Node 2' });
    const node3Button = within(listPanel).getByRole('button', { name: 'Node 3' });

    expect(node1Button).toHaveAttribute('aria-pressed', 'true');
    expect(node2Button).toHaveAttribute('aria-pressed', 'false');
    expect(node3Button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(node2Button, { ctrlKey: true });
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(node1Button).toHaveAttribute('aria-pressed', 'true');
    expect(node2Button).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(node3Button, { shiftKey: true });
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
    expect(node1Button).toHaveAttribute('aria-pressed', 'false');
    expect(node2Button).toHaveAttribute('aria-pressed', 'true');
    expect(node3Button).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders breadcrumbs in document header and jumps to ancestor anchor', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const parentNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'Parent',
      content: '# Parent <highlight id="1">Needle</highlight id="1">',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const childNode: Node = {
      id: 'node-3',
      parentNodeId: 'node-2',
      title: 'Child',
      content: '# Child',
      anchorLink: { id: '1', kind: 'highlight' },
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-3',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': parentNode,
        'node-3': childNode
      }
    }));

    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Parent' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('button', { name: 'Parent' }));
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    const expectedFrom = parentNode.content.indexOf('Needle');
    expect(mockEditorState.selectionFrom).toBe(expectedFrom);
    expect(mockEditorState.selectionTo).toBe(expectedFrom + 'Needle'.length);
  });

  it('supports toolbar parent and navigation history actions', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const parentNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'Parent',
      content: '# Parent <highlight id="1">Needle</highlight id="1">',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const childNode: Node = {
      id: 'node-3',
      parentNodeId: 'node-2',
      title: 'Child',
      content: '# Child',
      anchorLink: { id: '1', kind: 'highlight' },
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-3',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': parentNode,
        'node-3': childNode
      },
      navigation: { backStack: [], forwardStack: [] }
    }));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to parent node' }));
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });

  it('expands compact breadcrumbs when clicking ellipsis', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const n2: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'N2',
      content: '# N2',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const n3: Node = {
      id: 'node-3',
      parentNodeId: 'node-2',
      title: 'N3',
      content: '# N3',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const n4: Node = {
      id: 'node-4',
      parentNodeId: 'node-3',
      title: 'N4',
      content: '# N4',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const n5: Node = {
      id: 'node-5',
      parentNodeId: 'node-4',
      title: 'N5',
      content: '# N5',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-5',
      nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      nodesById: {
        ...state.nodesById,
        'node-2': n2,
        'node-3': n3,
        'node-4': n4,
        'node-5': n5
      }
    }));

    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
    expect(within(nav).queryByRole('button', { name: 'N2' })).not.toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('button', { name: 'Expand breadcrumb path' }));
    expect(within(nav).getByRole('button', { name: 'N2' })).toBeInTheDocument();
  });

  it('updates active node content from editor changes', () => {
    render(<App />);

    fireEvent.change(screen.getByTestId('editor-value'), {
      target: { value: 'Alpha Beta Gamma' }
    });

    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Alpha Beta Gamma');
  });

  it('creates a root node on first editor change when workspace has no active node', () => {
    useWorkspaceStore.setState({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {}
    });

    render(<App />);

    fireEvent.change(screen.getByTestId('editor-value'), {
      target: { value: 'Pasted from clipboard' }
    });

    const workspace = useWorkspaceStore.getState();
    expect(workspace.activeNodeId).toBeTruthy();
    if (!workspace.activeNodeId) {
      throw new Error('expected active node to be created');
    }
    expect(workspace.nodeOrder).toHaveLength(1);
    expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('Pasted from clipboard');
  });

  it('creates a new empty note from node panel action', () => {
    useWorkspaceStore.setState({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {}
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.activeNodeId).toBeTruthy();
    if (!workspace.activeNodeId) {
      throw new Error('expected active node to be created');
    }
    expect(workspace.nodeOrder).toHaveLength(1);
    expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('');
    expect(workspace.nodesById[workspace.activeNodeId]?.title).toBe('Untitled');
  });

  it('keeps first note content unchanged when editing a newly created note', () => {
    render(<App />);
    const originalFirstNodeContent = useWorkspaceStore.getState().nodesById['node-1']?.content;

    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    const workspaceAfterCreate = useWorkspaceStore.getState();
    const newNodeId = workspaceAfterCreate.activeNodeId;
    expect(newNodeId).toBeTruthy();
    if (!newNodeId) {
      throw new Error('expected new active node');
    }
    expect(newNodeId).not.toBe('node-1');

    fireEvent.change(screen.getByTestId('editor-value'), {
      target: { value: 'My second note content' }
    });

    const workspaceAfterEdit = useWorkspaceStore.getState();
    expect(workspaceAfterEdit.nodesById['node-1']?.content).toBe(originalFirstNodeContent);
    expect(workspaceAfterEdit.nodesById[newNodeId]?.content).toBe('My second note content');
  });

  it('creates highlight node from editor context menu without leaving current node', () => {
    render(<App />);
    const editor = screen.getByLabelText('Prompt editor');
    mockEditorState.selectionFrom = 2;
    mockEditorState.selectionTo = 9;

    fireEvent.contextMenu(editor, { clientX: 40, clientY: 48 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Highlight' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.activeNodeId).toBe('node-1');
    const createdNodeId = workspace.nodeOrder.find((nodeId) => nodeId !== 'node-1');
    expect(createdNodeId).toBeTruthy();
    if (!createdNodeId) {
      throw new Error('expected a child node');
    }
    expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
    expect(workspace.nodesById[createdNodeId]?.title).toBe('Welcome');
    expect(workspace.nodesById[createdNodeId]?.content).toBe('Welcome');
    expect(workspace.nodesById['node-1']?.content).toContain('<highlight id="1">Welcome</highlight id="1">');
  });

  it('creates cloze node from editor context menu without leaving current node', () => {
    render(<App />);
    const editor = screen.getByLabelText('Prompt editor');
    mockEditorState.selectionFrom = 2;
    mockEditorState.selectionTo = 9;

    fireEvent.contextMenu(editor, { clientX: 40, clientY: 48 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cloze' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.activeNodeId).toBe('node-1');
    const createdNodeId = workspace.nodeOrder.find((nodeId) => nodeId !== 'node-1');
    expect(createdNodeId).toBeTruthy();
    if (!createdNodeId) {
      throw new Error('expected a child node');
    }
    expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
    expect(workspace.nodesById[createdNodeId]?.title).toBe('[...] to Foliole Start writing markdown here.');
    expect(workspace.nodesById[createdNodeId]?.content).toBe('# [...] to Foliole\n\nStart writing markdown here.');
    expect(workspace.nodesById[createdNodeId]?.reveal).toBe('Welcome');
    expect(workspace.nodesById['node-1']?.content).toContain('<cloze id="1">Welcome</cloze id="1">');
  });

  it('creates cloze child content without inheriting anchor tags from parent', () => {
    useWorkspaceStore.getState().updateNodeContent('node-1', '# A <highlight id="1">B</highlight id="1"> C');
    render(<App />);
    const editor = screen.getByLabelText('Prompt editor');
    const content = mockEditorState.content;
    const start = content.lastIndexOf('C');
    mockEditorState.selectionFrom = start;
    mockEditorState.selectionTo = start + 1;

    fireEvent.contextMenu(editor, { clientX: 40, clientY: 48 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cloze' }));

    const workspace = useWorkspaceStore.getState();
    const createdNodeId = workspace.nodeOrder.find((nodeId) => nodeId !== 'node-1');
    expect(createdNodeId).toBeTruthy();
    if (!createdNodeId) {
      throw new Error('expected a child node');
    }
    expect(workspace.nodesById[createdNodeId]?.content).toBe('# A B [...]');
    expect(workspace.nodesById[createdNodeId]?.content).not.toContain('<highlight');
    expect(workspace.nodesById[createdNodeId]?.content).not.toContain('</highlight id="1">');
  });

  it('deletes a node from node-list context menu', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const childNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'Child',
      content: '# Child',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...state.nodesById,
        'node-2': childNode
      }
    }));

    render(<App />);
    const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Child' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-2']).toBeDefined();
    expect(workspace.trashedNodeIds).toContain('node-2');
    expect(workspace.activeNodeId).toBe('node-1');
    expect(within(nodePanel).queryByRole('button', { name: 'Child' })).not.toBeInTheDocument();
    const trashButton = within(nodePanel).getByRole('button', { name: 'Trash' });
    expect(trashButton).toHaveTextContent('Trash');
    fireEvent.click(trashButton);
    expect(within(nodePanel).getByRole('region', { name: 'Trash section' })).toBeInTheDocument();
    expect(within(nodePanel).getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(within(nodePanel).getByRole('button', { name: 'Empty' })).toBeInTheDocument();
    expect(within(nodePanel).getByRole('button', { name: 'Child' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Document area' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prompt editor')).toBeInTheDocument();
  });

  it('deletes all selected nodes from node-list context menu', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const node2: Node = {
      id: 'node-2',
      parentNodeId: null,
      title: 'Node 2',
      content: '# Node 2',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const node3: Node = {
      id: 'node-3',
      parentNodeId: null,
      title: 'Node 3',
      content: '# Node 3',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': node2,
        'node-3': node3
      }
    }));

    render(<App />);
    const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
    const node2Button = within(nodePanel).getByRole('button', { name: 'Node 2' });
    const node3Button = within(nodePanel).getByRole('button', { name: 'Node 3' });

    fireEvent.click(node2Button);
    fireEvent.click(node3Button, { ctrlKey: true });
    fireEvent.contextMenu(node3Button, { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-2']).toBeDefined();
    expect(workspace.nodesById['node-3']).toBeDefined();
    expect(workspace.trashedNodeIds).toEqual(expect.arrayContaining(['node-2', 'node-3']));
    expect(workspace.nodeOrder).toEqual(['node-1', 'node-2', 'node-3']);
    expect(workspace.activeNodeId).toBe('node-1');
    const trashButton = within(nodePanel).getByRole('button', { name: 'Trash' });
    expect(trashButton).toHaveTextContent('Trash');
    fireEvent.click(trashButton);
    expect(within(nodePanel).getByRole('region', { name: 'Trash section' })).toBeInTheDocument();
    expect(within(nodePanel).getByRole('button', { name: 'Node 2' })).toBeInTheDocument();
    expect(within(nodePanel).getByRole('button', { name: 'Node 3' })).toBeInTheDocument();
  });

  it('restores and permanently deletes nodes from trash context menu actions', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const childNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'Child',
      content: '# Child content',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...state.nodesById,
        'node-2': childNode
      }
    }));

    render(<App />);
    const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Child' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

    fireEvent.click(within(nodePanel).getByRole('button', { name: 'Trash' }));
    const trashedChildButton = within(nodePanel).getByRole('button', { name: 'Child' });
    fireEvent.contextMenu(trashedChildButton, { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
    expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-2');

    fireEvent.click(within(nodePanel).getByRole('button', { name: 'Notes' }));
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Child' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));
    fireEvent.click(within(nodePanel).getByRole('button', { name: 'Trash' }));
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Child' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));
    expect(useWorkspaceStore.getState().nodesById['node-2']).toBeUndefined();
    expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-2');
  });

  it('supports multi-select permanent delete inside trash', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const node2: Node = {
      id: 'node-2',
      parentNodeId: null,
      title: 'Node 2',
      content: '# Node 2',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const node3: Node = {
      id: 'node-3',
      parentNodeId: null,
      title: 'Node 3',
      content: '# Node 3',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': node2,
        'node-3': node3
      }
    }));

    render(<App />);
    const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Node 2' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Node 3' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

    fireEvent.click(within(nodePanel).getByRole('button', { name: 'Trash' }));
    const trashedNode2 = within(nodePanel).getByRole('button', { name: 'Node 2' });
    const trashedNode3 = within(nodePanel).getByRole('button', { name: 'Node 3' });
    fireEvent.click(trashedNode2);
    fireEvent.click(trashedNode3, { ctrlKey: true });
    fireEvent.contextMenu(trashedNode3, { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-2']).toBeUndefined();
    expect(workspace.nodesById['node-3']).toBeUndefined();
    expect(workspace.trashedNodeIds).not.toEqual(expect.arrayContaining(['node-2', 'node-3']));
  });

  it('empties all trash items from trash header action', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const node2: Node = {
      id: 'node-2',
      parentNodeId: null,
      title: 'Node 2',
      content: '# Node 2',
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...state.nodesById,
        'node-2': node2
      }
    }));

    render(<App />);
    const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
    fireEvent.contextMenu(within(nodePanel).getByRole('button', { name: 'Node 2' }), { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));
    fireEvent.click(within(nodePanel).getByRole('button', { name: 'Trash' }));
    fireEvent.click(within(nodePanel).getByRole('button', { name: 'Empty' }));

    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-2']).toBeUndefined();
    expect(workspace.trashedNodeIds).toEqual([]);
  });

  it('does not render save badge in document header', () => {
    render(<App />);

    expect(screen.queryByText('Not saved yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  it('updates persisted document width from side handle drag', () => {
    render(<App />);
    const rightHandle = screen.getByRole('separator', { name: 'Resize document width from right' });
    fireEvent.mouseDown(rightHandle, { clientX: 200 });
    fireEvent.mouseMove(window, { clientX: 280 });
    fireEvent.mouseUp(window);
    expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBeGreaterThan(DOCUMENT_WIDTH_DEFAULT);
  });

  it('supports keyboard resize on list splitter and reset by double click', () => {
    render(<App />);
    const splitter = screen.getByRole('separator', { name: 'Resize node list' });
    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });

    expect(useWorkspaceStore.getState().layout.listWidth).toBeLessThan(LIST_WIDTH_DEFAULT);
    fireEvent.doubleClick(splitter);
    expect(useWorkspaceStore.getState().layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
  });

  it('resets document width by double click handle', () => {
    useWorkspaceStore.getState().setDocumentMaxWidth(1400);
    render(<App />);
    const rightHandle = screen.getByRole('separator', { name: 'Resize document width from right' });
    fireEvent.doubleClick(rightHandle);
    expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  });
});
