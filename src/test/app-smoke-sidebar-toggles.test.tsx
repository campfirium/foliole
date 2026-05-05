import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

it('toggles both sidebars from the titlebar buttons', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(screen.queryByRole('complementary', { name: 'Node list panel' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Workspace side toolbar' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(screen.getByRole('region', { name: 'Workspace side toolbar' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);
  expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Dev panel' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  expect(screen.getByRole('button', { name: 'Dev panel' })).toBeInTheDocument();
});
