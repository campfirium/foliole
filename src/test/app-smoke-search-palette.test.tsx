import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('opens workspace search with Ctrl+K and searches node titles and content', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        title: 'Project Atlas',
        content: 'This note tracks rollout details.'
      }),
      'node-3': createNode({
        id: 'node-3',
        title: 'Weekly Log',
        content: 'Atlas launch checklist and follow-up notes.'
      })
    }
  }));

  render(<App />);

  fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
  const dialog = screen.getByRole('dialog', { name: 'Workspace search' });
  const input = within(dialog).getByLabelText('Search workspace');

  fireEvent.change(input, { target: { value: 'Atlas' } });

  await waitFor(() => {
    expect(within(dialog).getByRole('button', { name: /Project Atlas/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Weekly Log/i })).toBeInTheDocument();
  });

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  });
  expect(screen.queryByRole('dialog', { name: 'Workspace search' })).not.toBeInTheDocument();
});
