import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import {
  LIST_WIDTH_DEFAULT,
  RIGHT_SIDEBAR_WIDTH_DEFAULT,
  useWorkspaceStore
} from '../store/workspaceStore';

it('does not render save badge in document header', () => {
  render(<App />);

  expect(screen.queryByText('Not saved yet.')).not.toBeInTheDocument();
  expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
  expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
});

it('does not expose document width resize handles', () => {
  render(<App />);

  expect(screen.queryByRole('separator', { name: /Resize document width/ })).not.toBeInTheDocument();
});

it('supports keyboard resize on list splitter and reset by double click', () => {
  render(<App />);
  expect(screen.getByRole('complementary', { name: 'Topic list panel' })).toBeInTheDocument();
  const splitter = screen.getByRole('separator', { name: 'Resize topic list' });
  fireEvent.keyDown(splitter, { key: 'ArrowLeft' });

  expect(useWorkspaceStore.getState().layout.listWidth).toBeLessThan(LIST_WIDTH_DEFAULT);
  fireEvent.doubleClick(splitter);
  expect(useWorkspaceStore.getState().layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
});

it('supports keyboard resize on inspector splitter and reset by double click', () => {
  render(<App />);
  const splitter = screen.getByRole('separator', { name: 'Resize inspector sidebar' });
  fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBeGreaterThan(RIGHT_SIDEBAR_WIDTH_DEFAULT);

  fireEvent.doubleClick(splitter);
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
});
