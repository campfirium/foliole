import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

const { useNodeSourceUpdatePreviewMock } = vi.hoisted(() => ({
  useNodeSourceUpdatePreviewMock: vi.fn(() => ({
    isLoading: false,
    value: {
      checkedAt: '2026-03-28T04:00:00.000Z',
      currentContent: '# Welcome to Foliole\n\nStart writing markdown here.',
      sourceNodeId: 'node-1',
      updatedContent: '# Welcome to Foliole\n\nUpdated upstream content.'
    }
  }))
}));

vi.mock('../app/components/useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: useNodeSourceUpdatePreviewMock
}));

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

it('writes split panel edits back to the active document content', () => {
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
