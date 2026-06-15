import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { preloadTranslationCatalog } from '../shared/localization/translations';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';
import {
  dispatchNativeEscape,
  installNativeKeyboardBridge,
  resetReviewHotkeysRuntimeInvokeMock
} from './review-hotkeys-native-bridge';

vi.stubGlobal('ResizeObserver', class {
  disconnect() {}
  observe() {}
  unobserve() {}
});

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

afterEach(() => {
  resetReviewHotkeysRuntimeInvokeMock();
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

async function enterFlow() {
  fireEvent.click(await screen.findByRole('button', { name: 'Enter Flow' }));
}

it('supports review keyboard flow with edit mode guard (native Esc -> F)', async () => {
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

  const dispatchNativeKeyboard = installNativeKeyboardBridge();
  render(<App />);

  await enterFlow();

  const editor = screen.getByTestId('editor-value');
  expect(editor).toHaveAttribute('data-review-escape-blur', 'true');
  editor.focus();
  fireEvent.focusIn(editor);
  fireEvent.keyDown(editor, { key: ' ', code: 'Space' });
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();

  dispatchNativeEscape(dispatchNativeKeyboard);
  await waitFor(() => {
    expect(document.activeElement).not.toBe(editor);
  });
  fireEvent.keyDown(window, { key: 'f', code: 'KeyF' });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
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

  await enterFlow();

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

  await enterFlow();
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

  await enterFlow();
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

  await enterFlow();
  fireEvent.keyDown(window, { key: 't', code: 'KeyT' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().trashedNodeIds).toContain('node-1');
  });
});

it('confirms source topic deletion with T after Alt+T opens the dialog', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'review-item',
    nodeOrder: [...state.nodeOrder, 'source-topic', 'review-item'],
    nodesById: {
      ...state.nodesById,
      'source-topic': createNode({
        id: 'source-topic',
        title: 'Source Topic',
        content: 'Source body',
        kind: 'topic'
      }),
      'review-item': createNode({
        id: 'review-item',
        parentNodeId: 'source-topic',
        title: 'Review Item',
        content: 'Question',
        kind: 'item',
        reveal: 'Answer',
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
    }
  }));

  render(<App />);
  await enterFlow();

  fireEvent.keyDown(window, { altKey: true, code: 'KeyT', key: 't' });
  const dialog = await screen.findByRole('dialog', { name: 'Delete source topic?' });
  fireEvent.keyDown(dialog, { code: 'KeyF', key: 'f' });
  fireEvent.keyDown(dialog, { code: 'Enter', key: 'Enter' });
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('source-topic');
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('review-item');

  fireEvent.keyDown(dialog, { code: 'KeyT', key: 't' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().trashedNodeIds).toContain('source-topic');
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
  const dialog = screen.getByRole('dialog', { name: 'Set priority' });
  expect(within(dialog).getByText('Priority')).toBeInTheDocument();
  expect(within(dialog).getByText('5')).toBeInTheDocument();
  expect(within(dialog).getByText('9')).toBeInTheDocument();
  expect(within(dialog).getByText('0-9')).toBeInTheDocument();
  expect(within(dialog).getByText('apply instantly')).toBeInTheDocument();
  expect(within(dialog).queryByText('Esc to cancel')).not.toBeInTheDocument();

  fireEvent.change(within(dialog).getByRole('slider', { name: 'Priority' }), { target: { value: '7' } });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.priority).toBe(7);

  fireEvent.keyDown(window, { key: '0' });

  expect(useWorkspaceStore.getState().nodesById['node-1']?.priority).toBe(0);
  expect(screen.getByRole('button', { name: /Priority P0 set on this node/i })).toBeInTheDocument();
});
