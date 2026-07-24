import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { requestFoliolePublishedDelete } from '../../shared/platform/foliolePublishedManagement';
import { useWorkspaceStore } from '../../store/workspaceStore';

const publishMocks = vi.hoisted(() => ({
  inspectFoliolePublishedDeleteFromRuntime: vi.fn(),
  unpublishFolioleTopicsFromRuntime: vi.fn()
}));

vi.mock('../../shared/platform/foliolePublishRepository', () => publishMocks);

import { FoliolePublishedDeleteDialogHost } from './FoliolePublishedDeleteDialogHost';

beforeEach(() => {
  publishMocks.inspectFoliolePublishedDeleteFromRuntime.mockReset();
  publishMocks.unpublishFolioleTopicsFromRuntime.mockReset();
  useWorkspaceStore.setState({ deleteNodes: vi.fn() });
});

it('preserves the ordinary delete continuation when no Foliole page is published', async () => {
  const onAllowed = vi.fn();
  publishMocks.inspectFoliolePublishedDeleteFromRuntime.mockResolvedValue({ status: 'allowed' });
  renderWithLocalization(<FoliolePublishedDeleteDialogHost />);

  act(() => requestFoliolePublishedDelete({ nodeIds: ['topic-1'], onAllowed }));

  await waitFor(() => expect(onAllowed).toHaveBeenCalledOnce());
  expect(screen.queryByText('This Topic is published')).not.toBeInTheDocument();
});

it('unpublishes successfully before moving the Topic to Trash', async () => {
  publishMocks.inspectFoliolePublishedDeleteFromRuntime.mockResolvedValue({
    published_node_ids: ['topic-1'], source_keys: ['node:topic-1'], status: 'requires_unpublish'
  });
  publishMocks.unpublishFolioleTopicsFromRuntime.mockResolvedValue({ status: 'unpublished' });
  renderWithLocalization(<FoliolePublishedDeleteDialogHost />);

  act(() => requestFoliolePublishedDelete({ nodeIds: ['topic-1'] }));
  fireEvent.click(await screen.findByRole('button', { name: 'Unpublish and move to Trash' }));

  await waitFor(() => expect(useWorkspaceStore.getState().deleteNodes).toHaveBeenCalledWith(['topic-1']));
  expect(publishMocks.unpublishFolioleTopicsFromRuntime).toHaveBeenCalledWith(['node:topic-1']);
});

it('keeps the Topic in place when the local unpublish state cannot be committed', async () => {
  publishMocks.inspectFoliolePublishedDeleteFromRuntime.mockResolvedValue({
    published_node_ids: ['topic-1'], source_keys: ['node:topic-1'], status: 'requires_unpublish'
  });
  publishMocks.unpublishFolioleTopicsFromRuntime.mockResolvedValue({
    status: 'deployed_local_unpublish_state_failed', warning: 'Local commit failed.'
  });
  renderWithLocalization(<FoliolePublishedDeleteDialogHost />);

  act(() => requestFoliolePublishedDelete({ nodeIds: ['topic-1'] }));
  fireEvent.click(await screen.findByRole('button', { name: 'Unpublish and move to Trash' }));

  await waitFor(() => expect(publishMocks.unpublishFolioleTopicsFromRuntime).toHaveBeenCalledOnce());
  expect(useWorkspaceStore.getState().deleteNodes).not.toHaveBeenCalled();
});
