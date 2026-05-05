import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import {
  DOCUMENT_WIDTH_DEFAULT,
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

it('updates persisted document width from side handle drag', () => {
  render(<App />);
  const rightHandle = screen.getByRole('separator', { name: 'Resize document width from right' });
  fireEvent.mouseDown(rightHandle, { clientX: 200 });
  fireEvent.mouseMove(window, { clientX: 280 });
  fireEvent.mouseUp(window);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBeGreaterThan(DOCUMENT_WIDTH_DEFAULT);
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

it('resets document width by double click handle', () => {
  useWorkspaceStore.getState().setDocumentMaxWidth(1400);
  render(<App />);
  const rightHandle = screen.getByRole('separator', { name: 'Resize document width from right' });
  fireEvent.doubleClick(rightHandle);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
});

it('supports keyboard resize on inspector splitter and reset by double click', () => {
  render(<App />);
  const splitter = screen.getByRole('separator', { name: 'Resize inspector sidebar' });
  fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBeGreaterThan(RIGHT_SIDEBAR_WIDTH_DEFAULT);

  fireEvent.doubleClick(splitter);
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
});
