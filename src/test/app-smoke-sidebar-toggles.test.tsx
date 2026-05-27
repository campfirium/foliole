import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

function openRightPanelFromMenu(label: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More right sidebar panels' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(label, 'i') }));
}

it('toggles both sidebars from the titlebar buttons', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(screen.queryByRole('complementary', { name: 'Topic list panel' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Workspace side toolbar' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(screen.getByRole('region', { name: 'Workspace side toolbar' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);
  expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review queue panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More right sidebar panels' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  expect(screen.getByRole('button', { name: 'Review queue panel' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toBeInTheDocument();
});

it('keeps the workspace stable when switching right panels after collapsing the left panel', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);

  openRightPanelFromMenu('Highlights');
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('data-active', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review queue panel' }));

  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  expect(screen.getByRole('button', { name: 'Review queue panel' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('main', { name: 'Foliole workspace' })).toBeInTheDocument();
});

it('toggles sidebars from non-editing bracket shortcuts', () => {
  render(<App />);

  fireEvent.keyDown(window, { key: '[' });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);

  fireEvent.keyDown(window, { key: ']' });
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);

  fireEvent.keyDown(window, { key: '\\' });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);

  fireEvent.keyDown(window, { key: '\\' });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);
});
