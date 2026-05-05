import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { App } from '../app/App';
import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import type { Node } from '../features/nodes/model/nodeTypes';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

const mockEditorState: { content: string; selection: EditorSelection } = {
  content: '',
  selection: { from: 0, to: 0 }
};

const mockEditorAdapter: EditorAdapter = {
  destroy: () => undefined,
  focus: () => undefined,
  getContent: () => mockEditorState.content,
  setContent: (content: string) => {
    mockEditorState.content = content;
  },
  getSelection: () => mockEditorState.selection,
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
    mockEditorState.selection = { from: 0, to: 0 };
  });

  it('renders three-pane layout placeholders', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
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

  it('supports create -> edit -> derive key path', () => {
    render(<App />);

    fireEvent.change(screen.getByTestId('editor-value'), {
      target: { value: 'Alpha Beta Gamma' }
    });
    mockEditorState.selection = { from: 6, to: 10 };

    fireEvent.click(screen.getByRole('button', { name: 'Create QA Node' }));

    const state = useWorkspaceStore.getState();
    const createdNodeId = state.nodeOrder[1];
    const createdNode = createdNodeId ? state.nodesById[createdNodeId] : null;
    expect(createdNode).not.toBeNull();
    expect(createdNode?.content).toBe('Alpha [[...]] Gamma');
    expect(createdNode?.reveal).toBe('Beta');
  });

  it('shows save feedback while editing', () => {
    vi.useFakeTimers();
    try {
      render(<App />);

      expect(screen.getByText('Not saved yet.')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('editor-value'), {
        target: { value: 'New content' }
      });
      expect(screen.getByText('Saving...')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText('Saved.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
