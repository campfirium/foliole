import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.testSupport';

it('keeps main navigation available on ordinary folder list pages', () => {
  const onGoBack = vi.fn();
  const onGoForward = vi.fn();

  renderSectionWithProps({
    activeNodeId: 'node-1',
    canGoBack: true,
    canGoForward: true,
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'folder', content: 'Folder prose should stay hidden' },
      'node-2': { ...baseNode, id: 'node-2', parentNodeId: 'node-1', title: 'Child topic', content: '# Child topic' }
    },
    onGoBack,
    onGoForward
  });

  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));

  expect(onGoBack).toHaveBeenCalledTimes(1);
  expect(onGoForward).toHaveBeenCalledTimes(1);
});

it('keeps the folder navigation hot zone mounted when history is empty', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    canGoBack: false,
    canGoForward: false,
    editorNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'folder', content: 'Folder prose should stay hidden' }
    }
  });

  expect(screen.getByRole('button', { name: 'Go back' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Go forward' })).toBeDisabled();
});
