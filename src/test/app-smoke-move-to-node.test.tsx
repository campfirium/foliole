import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, getCurrentFolderPanel } from './app-smoke.shared';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;
const RELEASE_GATE_WAIT_OPTIONS = { timeout: RELEASE_GATE_TEST_TIMEOUT_MS };

async function openCommandPaletteByShortcut() {
  fireEvent.click(screen.getByRole('button', { name: 'Command Palette' }));
  return screen.findByRole('dialog', { name: 'Command palette' }, RELEASE_GATE_WAIT_OPTIONS);
}

async function openCommandPalette() {
  const commandDialog = await openCommandPaletteByShortcut();
  return {
    commandDialog,
    commandInput: within(commandDialog).getByLabelText('Search commands')
  };
}

function seedActiveTopicMoveContext() {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    browseRootNodeId: 'folder-a',
    nodeOrder: ['folder-a', 'node-2', 'node-3', 'folder-b'],
    nodesById: {
      ...state.nodesById,
      'folder-a': createNode({
        id: 'folder-a',
        kind: 'folder',
        title: 'Source Folder',
        content: ''
      }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'folder-a',
        kind: 'topic',
        title: 'Article A',
        content: 'Current article'
      }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        kind: 'topic',
        title: 'Article Child',
        content: 'Descendant should never be a move target'
      }),
      'folder-b': createNode({
        id: 'folder-b',
        kind: 'folder',
        title: 'Destination Folder',
        content: ''
      })
    }
  }));
}

it('moves the active node under an empty target node from the command palette', async () => {
  seedActiveTopicMoveContext();

  render(<App />);

  const { commandDialog, commandInput } = await openCommandPalette();

  fireEvent.change(commandInput, { target: { value: 'move to' } });
  await waitFor(() => {
    expect(within(commandDialog).getByRole('button', { name: 'Move to...' })).toBeInTheDocument();
  });

  fireEvent.keyDown(commandInput, { key: 'Enter' });

  const moveDialog = await screen.findByRole('dialog', { name: 'Move to' });
  const moveInput = within(moveDialog).getByLabelText('Move to');
  fireEvent.change(moveInput, { target: { value: 'Article' } });

  await waitFor(() => {
    expect(within(moveDialog).queryByRole('button', { name: /Article A/i })).not.toBeInTheDocument();
    expect(within(moveDialog).queryByRole('button', { name: /Article Child/i })).not.toBeInTheDocument();
  });

  fireEvent.change(moveInput, { target: { value: 'Destination' } });

  await waitFor(() => {
    expect(within(moveDialog).getByRole('button', { name: /Destination Folder/i })).toBeInTheDocument();
  });

  fireEvent.keyDown(moveInput, { key: 'Enter' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-2']?.parentNodeId).toBe('folder-b');
  });
  expect(useWorkspaceStore.getState()).toMatchObject({
    activeNodeId: 'node-2',
    browseRootNodeId: 'folder-b'
  });
  expect(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Article A' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Move to' })).not.toBeInTheDocument();
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('keeps non-derived topics as move targets even when they already have content', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', kind: 'topic', title: 'Source Article', content: 'Current article' }),
      'node-3': createNode({ id: 'node-3', kind: 'topic', title: 'Plain Article', content: 'No child nodes here' }),
      'node-4': createNode({ id: 'node-4', kind: 'topic', title: 'Empty Group', content: '' }),
      'node-5': createNode({ id: 'node-5', kind: 'topic', title: 'Another Empty', content: '' })
    }
  }));

  render(<App />);

  const { commandInput } = await openCommandPalette();
  fireEvent.change(commandInput, { target: { value: 'move to' } });
  fireEvent.keyDown(commandInput, { key: 'Enter' });

  const moveDialog = await screen.findByRole('dialog', { name: 'Move to' });
  const moveInput = within(moveDialog).getByLabelText('Move to');
  fireEvent.change(moveInput, { target: { value: 'Article' } });

  await waitFor(() => {
    expect(within(moveDialog).getByRole('button', { name: /Plain Article/i })).toBeInTheDocument();
  });

  fireEvent.change(moveInput, { target: { value: 'Empty' } });
  await waitFor(() => {
    expect(within(moveDialog).getByRole('button', { name: /Empty Group/i })).toBeInTheDocument();
  });
});
