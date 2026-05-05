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

const mockEditorState: { content: string } = { content: '' };

const mockEditorAdapter: EditorAdapter = {
  destroy: () => undefined,
  focus: () => undefined,
  getContent: () => mockEditorState.content,
  setContent: (content: string) => {
    mockEditorState.content = content;
  },
  getSelection: () => ({ from: 0, to: 0 }),
  setSelection: () => undefined,
  getScrollTop: () => 0,
  setScrollTop: () => undefined,
  replaceSelection: () => undefined,
  onContentChange: () => () => undefined
};

vi.mock('../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    onReady
  }: {
    value: string;
    onChange: (value: string) => void;
    onReady?: (adapter: EditorAdapter | null) => void;
  }) => {
    mockEditorState.content = value;
    onReady?.(mockEditorAdapter);
    return (
      <textarea
        aria-label="Mock editor"
        data-testid="editor-value"
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
    localStorage.clear();
    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
    mockEditorState.content = '# Welcome to Foliole\n\nStart writing markdown here.';
  });

  it('renders note list and single document panel', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Document' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create QA Node' })).not.toBeInTheDocument();
  });

  it('loads selected node content into editor', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const qaNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'QA 2',
      content: 'Prompt [[...]]',
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
    expect(screen.getByTestId('editor-value')).toHaveValue('Prompt [[...]]');
  });

  it('renders breadcrumbs in document header and supports ancestor jump', () => {
    const timestamp = '2026-02-25T00:00:00.000Z';
    const parentNode: Node = {
      id: 'node-2',
      parentNodeId: 'node-1',
      title: 'Parent',
      content: '# Parent',
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
  });

  it('updates active node content from editor changes', () => {
    render(<App />);

    fireEvent.change(screen.getByTestId('editor-value'), {
      target: { value: 'Alpha Beta Gamma' }
    });

    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Alpha Beta Gamma');
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
