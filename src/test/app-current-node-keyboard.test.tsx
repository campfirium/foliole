import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

it('keeps Delete reserved while the editor is focused', () => {
  render(<App />);

  const editor = screen.getByTestId('editor-value');
  editor.focus();
  fireEvent.focusIn(editor);
  fireEvent.keyDown(editor, { code: 'Delete', key: 'Delete' });
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-1');
});
