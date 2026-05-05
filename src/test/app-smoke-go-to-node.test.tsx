import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('runs go to node from the command palette without replacing workspace search', async () => {
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
        parentNodeId: 'node-2',
        title: 'Weekly Log',
        content: 'Atlas launch checklist and follow-up notes.'
      })
    }
  }));

  render(<App />);

  fireEvent.keyDown(window, { ctrlKey: true, key: 'p' });
  const commandDialog = screen.getByRole('dialog', { name: 'Command palette' });
  const commandInput = within(commandDialog).getByLabelText('Search commands');

  fireEvent.change(commandInput, { target: { value: 'go to' } });
  await waitFor(() => {
    expect(within(commandDialog).getByRole('button', { name: 'Go to…' })).toBeInTheDocument();
  });

  fireEvent.click(within(commandDialog).getByRole('button', { name: 'Go to…' }));

  const goToNodeDialog = await screen.findByRole('dialog', { name: 'Go to' });
  const goToNodeInput = within(goToNodeDialog).getByLabelText('Go to');
  fireEvent.change(goToNodeInput, { target: { value: 'Weekly' } });

  await waitFor(() => {
    expect(within(goToNodeDialog).getByRole('button', { name: /Weekly Log/i })).toBeInTheDocument();
    expect(within(goToNodeDialog).getByText('Project Atlas')).toBeInTheDocument();
  });

  fireEvent.keyDown(goToNodeInput, { key: 'Enter' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  });
  expect(screen.queryByRole('dialog', { name: 'Go to' })).not.toBeInTheDocument();
});

it('shows nodes immediately and puts the last used target first when reopened', async () => {
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
        title: 'Inbox Target',
        content: 'This note is only here to test recents.'
      })
    }
  }));

  render(<App />);

  fireEvent.keyDown(window, { ctrlKey: true, key: 'p' });
  let commandInput = within(screen.getByRole('dialog', { name: 'Command palette' })).getByLabelText('Search commands');
  fireEvent.change(commandInput, { target: { value: 'go to' } });
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Command palette' })).getByRole('button', { name: 'Go to…' }));

  const firstDialog = await screen.findByRole('dialog', { name: 'Go to' });
  expect(within(firstDialog).getByRole('button', { name: /Welcome to Foliole/i })).toBeInTheDocument();
  fireEvent.click(within(firstDialog).getByRole('button', { name: /Project Atlas/i }));

  fireEvent.keyDown(window, { ctrlKey: true, key: 'p' });
  commandInput = within(screen.getByRole('dialog', { name: 'Command palette' })).getByLabelText('Search commands');
  fireEvent.change(commandInput, { target: { value: 'go to' } });
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Command palette' })).getByRole('button', { name: 'Go to…' }));

  const secondDialog = await screen.findByRole('dialog', { name: 'Go to' });
  const resultButtons = within(secondDialog).getAllByRole('button');
  expect(resultButtons[0]).toHaveTextContent('Project Atlas');
});
