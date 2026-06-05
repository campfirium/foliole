import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
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

it('shows a progress state while the workspace list hydrates', () => {
  renderWithLocalization(<WorkspaceListLoadingState />);

  expect(screen.getByLabelText('Workspace list progress')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('Preparing workspace')).toBeNull();
});

it('shows a retryable error when workspace hydration fails', async () => {
  useWorkspaceStore.setState({
    workspaceHydrationError: 'Could not load the workspace.'
  });

  renderWithLocalization(<WorkspaceListLoadingState />);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load the workspace.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
});
