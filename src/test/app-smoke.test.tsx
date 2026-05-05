import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { App } from '../app/App';
import type { Node } from '../features/nodes/model/nodeTypes';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

vi.mock('../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: ({ value }: { value: string }) => <div data-testid="editor-value">{value}</div>
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
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

    expect(screen.getByTestId('editor-value')).toHaveTextContent('# Welcome to Foliole');
    fireEvent.click(screen.getByRole('button', { name: 'QA 2' }));
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(screen.getByTestId('editor-value')).toHaveTextContent('Prompt [[...]]');
  });
});
