import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { App } from '../app/App';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import type { Node } from '../features/nodes/model/nodeTypes';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

const mockEditorState: { content: string } = { content: '' };

const mockEditorAdapter: EditorAdapter = {
  destroy: () => undefined,
  focus: () => undefined,
  getContent: () => mockEditorState.content,
  setContent: (content: string) => {
    mockEditorState.content = content;
  },
  getSelection: () => ({ from: 0, to: 0 }),
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
});
