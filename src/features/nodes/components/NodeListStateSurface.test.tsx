import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../../../store/workspaceStore';
import { ensureWorkspaceHydrated } from '../../../store/workspaceStoreHydration';

import { NodeListStateSurface } from './NodeListStateSurface';

vi.mock('../../../store/workspaceStoreHydration', async () => {
  const actual = await vi.importActual<typeof import('../../../store/workspaceStoreHydration')>('../../../store/workspaceStoreHydration');
  return {
    ...actual,
    ensureWorkspaceHydrated: vi.fn()
  };
});

beforeEach(() => {
  vi.mocked(ensureWorkspaceHydrated).mockClear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-05-14T00:00:00.000Z')));
});

function renderListStateSurface(hasRows: boolean) {
  render(
    <NodeListStateSurface
      emptyState={{ description: 'Add a topic to get started.', title: 'No topics in this folder' }}
      hasRows={hasRows}
    >
      <div role="tree">Ready rows</div>
    </NodeListStateSurface>
  );
}

it('shows loading before empty rows are ready', () => {
  renderListStateSurface(false);

  expect(screen.getByText('Loading workspace')).toBeInTheDocument();
  expect(screen.queryByText('No topics in this folder')).toBeNull();
});

it('shows retryable error before empty rows are ready', () => {
  useWorkspaceStore.setState({ workspaceHydrationError: 'Could not load the workspace.' });

  renderListStateSurface(false);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load the workspace.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
});

it('shows empty state only after rows are ready', () => {
  useWorkspaceStore.setState({ isHydrated: true, workspaceHydrationError: null });

  renderListStateSurface(false);

  expect(screen.getByText('No topics in this folder')).toBeInTheDocument();
});

it('keeps ready rows visible even while hydration is pending', () => {
  renderListStateSurface(true);

  expect(screen.getByText('Ready rows')).toBeInTheDocument();
  expect(screen.queryByText('Loading workspace')).toBeNull();
});
