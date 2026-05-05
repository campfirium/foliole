import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { ensureWorkspaceHydrated } from '../../store/workspaceStoreHydration';

import { WorkspaceListLoadingState } from './WorkspaceListStates';

vi.mock('../../store/workspaceStoreHydration', async () => {
  const actual = await vi.importActual<typeof import('../../store/workspaceStoreHydration')>('../../store/workspaceStoreHydration');
  return {
    ...actual,
    ensureWorkspaceHydrated: vi.fn()
  };
});

beforeEach(() => {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-30T00:00:00.000Z')));
});

it('shows a loading state while the workspace list hydrates', () => {
  render(<WorkspaceListLoadingState />);

  expect(screen.getByText('Loading workspace')).toBeInTheDocument();
  expect(screen.getByText('Loading topics and folders.')).toBeInTheDocument();
});

it('shows a retryable error when workspace hydration fails', async () => {
  useWorkspaceStore.setState({
    workspaceHydrationError: 'Could not load the workspace.'
  });

  render(<WorkspaceListLoadingState />);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load the workspace.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
});
