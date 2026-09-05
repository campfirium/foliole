import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getUndoRouterContentContext, setUndoRouterOwner, setUndoRouterTarget } from '../hooks/undoRouter';

const storeMocks = vi.hoisted(() => ({ pushEditorOperationEntry: vi.fn() }));

vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({ pushEditorOperationEntry: storeMocks.pushEditorOperationEntry })
  }
}));

import { useAnswerEditorHistory } from './useAnswerEditorHistory';

afterEach(() => {
  storeMocks.pushEditorOperationEntry.mockClear();
  setUndoRouterOwner('workspace');
});

it('registers answer replay context and records only its text transactions', () => {
  const applyTextHistory = vi.fn(() => true);
  const adapter = {
    applyTextHistory,
    getContent: vi.fn(() => 'Answer')
  } as unknown as EditorAdapter;
  const { result, unmount } = renderHook(() => useAnswerEditorHistory('node-1::answer'));

  act(() => result.current.handleReady(adapter));
  setUndoRouterTarget('content', 'node-1::answer');
  const context = getUndoRouterContentContext(undefined);
  expect(context?.nodeId).toBe('node-1::answer');
  expect(context?.getCurrentContent?.()).toBe('Answer');

  const matching = { nodeId: 'node-1::answer' } as never;
  const unrelated = { nodeId: 'node-1' } as never;
  act(() => result.current.handleDocumentInput({
    nodeId: 'node-1::answer',
    textTransactions: [matching, unrelated]
  }));
  expect(storeMocks.pushEditorOperationEntry).toHaveBeenCalledOnce();
  expect(storeMocks.pushEditorOperationEntry).toHaveBeenCalledWith(matching);

  unmount();
  expect(getUndoRouterContentContext(undefined)).toBeUndefined();
});
