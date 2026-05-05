import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './reactPdfMock';

import { useWorkspaceStore } from '../store/workspaceStore';

import { useNodeSourceUpdatePreviewMock } from './app-smoke.shared';

const { App } = await import('../app/App');

it('writes split panel edits back to the active document content', () => {
  useNodeSourceUpdatePreviewMock.mockReturnValue({
    isLoading: false,
    value: {
      checkedAt: '2026-03-28T04:00:00.000Z',
      currentHighlightCount: 1,
      currentContent: '# Welcome to Foliole\n\nStart writing markdown here.',
      sourceNodeId: 'node-1',
      updatedHighlightCount: 2,
      updatedContent: '# Welcome to Foliole\n\nUpdated upstream content.'
    }
  } as never);

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle source update panel' }));

  const dialog = screen.getByRole('dialog');
  const editors = within(dialog).getAllByTestId('editor-value');
  fireEvent.change(editors[0], {
    target: { value: '# Welcome to Foliole\n\nChanged from source update panel.' }
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close source update panel' }));

  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe(
    '# Welcome to Foliole\n\nChanged from source update panel.'
  );
  expect(screen.getAllByTestId('editor-value')[0]).toHaveValue('# Welcome to Foliole\n\nChanged from source update panel.');
});
