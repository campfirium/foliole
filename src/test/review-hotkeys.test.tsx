import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { FIXED_TIMESTAMP } from './app-smoke.shared';

it('supports review keyboard flow with edit mode guard (Esc -> Space -> 1/2/3/4)', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1'],
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
      }
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  const editor = screen.getByTestId('editor-value');
  editor.focus();
  fireEvent.keyDown(editor, { key: ' ', code: 'Space' });
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();

  fireEvent.keyDown(editor, { key: 'Escape' });
  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
  });

  fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Review complete' })).toBeInTheDocument();
  });
});

it('shows separate primary and secondary review shortcuts in hotkey settings', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hotkeys' }));

  expect(screen.getByLabelText('Primary shortcut for Grade Review: Again')).toHaveValue('1');
  expect(screen.getByLabelText('Primary shortcut for Grade Review: Hard')).toHaveValue('2');
  expect(screen.getByLabelText('Primary shortcut for Grade Review: Good')).toHaveValue('3');
  expect(screen.getByLabelText('Primary shortcut for Grade Review: Easy')).toHaveValue('4');
  expect(screen.getByLabelText('Primary shortcut for Reading: Later')).toHaveValue('1');
  expect(screen.getByLabelText('Primary shortcut for Reading: Read')).toHaveValue('3');
  expect(screen.getByLabelText('Secondary shortcut for Reading: Read')).toHaveValue('Space');
  expect(screen.getByLabelText('Primary shortcut for Reading: Dismiss')).toHaveValue('5');
});

it('uses reading hotkeys without reusing FSRS grading semantics', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument();

  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Review complete' })).toBeInTheDocument();
  });
});
