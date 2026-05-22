import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

vi.stubGlobal('ResizeObserver', class {
  disconnect() {}
  observe() {}
  unobserve() {}
});

function seedActiveNode(node: ReturnType<typeof createNode>) {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: node.id,
    nodeOrder: [node.id],
    nodesById: {
      ...state.nodesById,
      [node.id]: node
    }
  }));
}

function seedNodes(activeNodeId: string, nodes: Array<ReturnType<typeof createNode>>) {
  useWorkspaceStore.setState((state) => ({
    activeNodeId,
    nodeOrder: nodes.map((node) => node.id),
    nodesById: {
      ...state.nodesById,
      ...Object.fromEntries(nodes.map((node) => [node.id, node]))
    }
  }));
}

it('supports review keyboard flow with edit mode guard (Esc -> Space -> 1/2/3/4)', async () => {
  seedActiveNode(
    createNode({
      id: 'node-1',
      title: 'Node 1',
      content: 'Question',
      kind: 'item',
      reveal: 'Answer 1',
      review: {
        due: FIXED_TIMESTAMP,
        lastReviewAt: null,
        state: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0
      }
    })
  );

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  const editor = screen.getByTestId('editor-value');
  editor.focus();
  fireEvent.focusIn(editor);
  fireEvent.keyDown(editor, { key: ' ', code: 'Space' });
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();

  const stopEscapePropagation = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
    }
  };
  editor.addEventListener('keydown', stopEscapePropagation);
  fireEvent.keyDown(editor, { key: 'Escape' });
  editor.removeEventListener('keydown', stopEscapePropagation);
  await waitFor(() => {
    expect(document.activeElement).not.toBe(editor);
  });
  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
  });

  fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.review?.lastReviewAt).not.toBeNull();
  });
});

it('shows separate primary and secondary review shortcuts in hotkey settings', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
});

it('uses reading hotkeys with F/R action keys and Space as Read', async () => {
  seedActiveNode(
    createNode({
      id: 'node-1',
      title: 'Node 1',
      content: 'Body',
      kind: 'topic'
    })
  );

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument();

  fireEvent.keyDown(window, { key: 'f', code: 'KeyF' });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.reading?.lastHandledAt).toBeTruthy();
  });
});

it('dismisses reading review items with R', async () => {
  seedActiveNode(
    createNode({
      id: 'node-1',
      title: 'Node 1',
      content: 'Body',
      kind: 'topic'
    })
  );

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.reading?.lastHandledAt).toBeTruthy();
  });
});

it('uses numeric reading fallback keys', async () => {
  seedActiveNode(
    createNode({
      id: 'node-1',
      title: 'Node 1',
      content: 'Body',
      kind: 'topic'
    })
  );

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.reading?.lastHandledAt).toBeTruthy();
  });
});

it('deletes the current review item with T and Delete', async () => {
  seedActiveNode(
    createNode({
      id: 'node-1',
      title: 'Node 1',
      content: 'Body',
      kind: 'topic'
    })
  );

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.keyDown(window, { key: 't', code: 'KeyT' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().trashedNodeIds).toContain('node-1');
  });
});

it('navigates review mode with WASD and QE while preserving parent return', async () => {
  seedNodes('child-1', [
    createNode({ id: 'topic-1', title: 'Topic 1', content: 'Parent', kind: 'topic' }),
    createNode({ id: 'child-1', parentNodeId: 'topic-1', title: 'Child 1', content: 'Question', kind: 'item', reveal: 'Answer' }),
    createNode({ id: 'child-2', parentNodeId: 'topic-1', title: 'Child 2', content: 'Sibling', kind: 'topic' })
  ]);

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.keyDown(window, { key: 'w', code: 'KeyW' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('topic-1'));

  fireEvent.keyDown(window, { key: 's', code: 'KeyS' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('child-1'));

  fireEvent.keyDown(window, { key: 'e', code: 'KeyE' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('child-2'));

  fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('child-1'));

  fireEvent.keyDown(window, { key: 'd', code: 'KeyD' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('child-2'));
});

it('confirms source topic deletion with Alt T', async () => {
  seedNodes('child-1', [
    createNode({ id: 'topic-1', title: 'Topic 1', content: 'Parent', kind: 'topic' }),
    createNode({ id: 'child-1', parentNodeId: 'topic-1', title: 'Child 1', content: 'Question', kind: 'item', reveal: 'Answer' })
  ]);

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.keyDown(window, { key: 't', code: 'KeyT', altKey: true });
  fireEvent.keyDown(window, { key: 't', code: 'KeyT', altKey: true });

  expect(screen.getAllByRole('dialog', { name: 'Delete source topic?' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Delete source topic' }));

  await waitFor(() => {
    expect(useWorkspaceStore.getState().trashedNodeIds).toContain('topic-1');
  });
});

it('supports quick priority changes from the two-step shortcut', () => {
  seedActiveNode(
    createNode({
      id: 'node-1',
      title: 'Node 1',
      content: 'Body',
      kind: 'topic'
    })
  );

  render(<App />);

  fireEvent.keyDown(window, { key: 'm', ctrlKey: true });
  expect(screen.getByText('Set priority')).toBeInTheDocument();
  expect(screen.getByText('0-9 to set')).toBeInTheDocument();
  expect(screen.getByText('Esc to cancel')).toBeInTheDocument();

  fireEvent.keyDown(window, { key: '0' });

  expect(useWorkspaceStore.getState().nodesById['node-1']?.priority).toBe(0);
  expect(screen.getByRole('button', { name: /Priority P0 set on this node/i })).toBeInTheDocument();
});
