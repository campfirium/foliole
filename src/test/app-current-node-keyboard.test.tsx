import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

it('keeps Delete reserved while the editor is focused and sends the current article to trash after focus leaves', async () => {
  render(<App />);

  const editor = screen.getByTestId('editor-value');
  editor.focus();
  fireEvent.focusIn(editor);
  fireEvent.keyDown(editor, { code: 'Delete', key: 'Delete' });
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-1');

  editor.blur();
  fireEvent.focusOut(editor);
  await waitFor(() => {
    expect(document.activeElement).not.toBe(editor);
  });

  await waitFor(() => {
    fireEvent.keyDown(window, { code: 'Delete', key: 'Delete' });
    expect(useWorkspaceStore.getState().trashedNodeIds).toContain('node-1');
  });
});
