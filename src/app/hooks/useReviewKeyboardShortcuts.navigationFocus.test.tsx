import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ReviewShortcutHarness } from './useReviewKeyboardShortcuts.testUtils';

function createReviewNavigationNodes() {
  return {
    parent: {
      id: 'parent',
      parentNodeId: null,
      kind: 'topic',
      title: 'Parent',
      content: '',
      reveal: null,
      reading: null,
      review: null,
      createdAt: '2026-02-25T00:00:00.000Z',
      updatedAt: '2026-02-25T00:00:00.000Z'
    },
    child: {
      id: 'child',
      parentNodeId: 'parent',
      kind: 'topic',
      title: 'Child',
      content: '',
      reveal: null,
      reading: null,
      review: null,
      createdAt: '2026-02-25T00:00:00.000Z',
      updatedAt: '2026-02-25T00:00:00.000Z'
    }
  } as const;
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = '';
});

it('keeps review navigation shortcuts in hotkey mode after the target node restores editor focus', () => {
  vi.useFakeTimers();
  const resumeReviewItem = vi.fn();
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  document.body.append(editor);
  const selectNode = vi.fn(() => {
    requestAnimationFrame(() => editor.focus());
  });
  render(
    <ReviewShortcutHarness
      activeNodeId="parent"
      isCurrentReviewItemVisible={false}
      nodesById={createReviewNavigationNodes()}
      nodeOrder={['parent', 'child']}
      resumeReviewItem={resumeReviewItem}
      reviewCurrentNodeId="child"
      selectNode={selectNode}
    />
  );

  fireEvent.keyDown(window, { key: 's' });
  act(() => {
    vi.runOnlyPendingTimers();
  });
  fireEvent.keyDown(window, { key: 'r' });

  expect(selectNode).toHaveBeenCalledWith('child');
  expect(document.activeElement).not.toBe(editor);
  expect(resumeReviewItem).toHaveBeenCalledTimes(1);
});
