import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { writeFolioleWebBinding } from '../../../lib/core/foliolePublish/folioleWebPublishFrontmatter';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { requestFoliolePublishedDelete } from '../../shared/platform/runtime/foliolePublishedManagement';
import { useWorkspaceStore, type WorkspaceState } from '../../store/workspaceStore';

const publishMocks = vi.hoisted(() => ({
  inspectFoliolePublishedDeleteFromRuntime: vi.fn(),
  unpublishFolioleTopicsFromRuntime: vi.fn()
}));

vi.mock('../../shared/platform/foliolePublishRepository', () => publishMocks);

const loadDocument = vi.hoisted(() => vi.fn());
vi.mock('../../shared/platform/workspaceRuntimeDocumentRepository', async (original) => ({
  ...await original<typeof import('../../shared/platform/workspaceRuntimeDocumentRepository')>(),
  loadWorkspaceNodeDocumentFromRuntime: loadDocument
}));

import { FoliolePublishedDeleteDialogHost } from './FoliolePublishedDeleteDialogHost';

beforeEach(() => {
  loadDocument.mockReset();
  publishMocks.inspectFoliolePublishedDeleteFromRuntime.mockReset();
  publishMocks.unpublishFolioleTopicsFromRuntime.mockReset();
  useWorkspaceStore.setState({ deleteNodes: vi.fn(), nodesById: {} });
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
  const content = writeFolioleWebBinding('Body', {
    fields: [], lastPublishedAt: 'now', pageId: '1', site: 'https://example.com', url: 'https://example.com/topics/1/'
  });
  const updateNodeContent = vi.fn<WorkspaceState['updateNodeContent']>(
    async (_nodeId, _content, options) => {
      options?.historySave?.confirm(true);
      return true;
    }
  );
  loadDocument.mockResolvedValue({ content, currentVersionId: 'version-1' });
  useWorkspaceStore.setState({ updateNodeContent });
  renderWithLocalization(<FoliolePublishedDeleteDialogHost />);

  act(() => requestFoliolePublishedDelete({ nodeIds: ['topic-1'] }));
  fireEvent.click(await screen.findByRole('button', { name: 'Unpublish and move to Trash' }));

  await waitFor(() => expect(useWorkspaceStore.getState().deleteNodes).toHaveBeenCalledWith(['topic-1']));
  expect(publishMocks.unpublishFolioleTopicsFromRuntime).toHaveBeenCalledWith(['node:topic-1']);
  expect(updateNodeContent).toHaveBeenCalledWith('topic-1',
    '---\nfoliole:\n  publish:\n    schemaVersion: 1\n---\nBody', expect.objectContaining({ baseContent: content }));
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
