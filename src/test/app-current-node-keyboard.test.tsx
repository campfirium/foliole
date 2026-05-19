import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

it('leaves editor focus with Escape before Delete sends the current article to trash', async () => {
  render(<App />);

  const editor = screen.getByTestId('editor-value');
  editor.focus();
  fireEvent.focusIn(editor);
  fireEvent.keyDown(editor, { code: 'Delete', key: 'Delete' });
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-1');

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

  fireEvent.keyDown(window, { code: 'Delete', key: 'Delete' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().trashedNodeIds).toContain('node-1');
  });
});
