import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { setSystemEntryDisplayNames } from '../../shared/localization/systemEntryDisplayNamesStore';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

const publishMocks = vi.hoisted(() => ({
  loadFoliolePublishedTopicsFromRuntime: vi.fn(),
  unpublishFolioleTopicsFromRuntime: vi.fn()
}));

vi.mock('../../shared/platform/foliolePublishRepository', () => publishMocks);

import { PublishedVirtualDocumentSurface } from './PublishedVirtualDocumentSurface';

const topicNode: Node = {
  content: '# Active Topic', createdAt: '2026-07-24T00:00:00.000Z', id: 'topic-1',
  isTitleManual: true, kind: 'topic', parentNodeId: null, reveal: null, review: null,
  title: 'Active Topic', updatedAt: '2026-07-24T00:00:00.000Z'
};

beforeEach(() => {
  Object.values(publishMocks).forEach((mock) => mock.mockReset());
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
  useWorkspaceStore.setState({ isHydrated: true, workspaceHydrationError: null });
});

it('shows the shared system alias as the Published folder heading', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({ status: 'ready', topics: [] });
  setSystemEntryDisplayNames({ customDisplayNameById: { published: 'Public shelf' }, version: 1 });

  renderWithLocalization(
    <PublishedVirtualDocumentSurface
      activeNodeId={null}
      nodesById={{}}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onSelectNode={vi.fn()}
      sortDirection="desc"
      sortKey="dateSaved"
      trashedNodeIds={[]}
    />
  );

  expect(await screen.findByRole('heading', { name: 'Public shelf' })).toBeVisible();
});

it('shows published Topics in the shared content list with the description in search', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({
    status: 'ready',
    topics: [
      {
        node_id: 'topic-1', number: 1, source_key: 'node:topic-1', source_state: 'active',
        title: 'Active Topic', updated_at: '2026-07-24T00:00:00.000Z', url: 'https://example.com/topics/1/'
      }
    ]
  });

  renderWithLocalization(
    <AppConfirmationProvider>
      <PublishedVirtualDocumentSurface
        activeNodeId={null}
        nodesById={{ 'topic-1': topicNode }}
        onChangeSortDirection={vi.fn()}
        onChangeSortKey={vi.fn()}
        onSelectNode={vi.fn()}
        sortDirection="desc"
        sortKey="dateSaved"
        trashedNodeIds={[]}
      />
    </AppConfirmationProvider>
  );

  expect(await screen.findByText('Active Topic')).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'Search Topics published to your site' })).toHaveAttribute(
    'placeholder',
    'Search Topics published to your site'
  );
  expect(screen.queryByText('Manage the Topics currently visible on your site.')).not.toBeInTheDocument();
});

it('uses the shared virtual list empty state without a Published description header', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({ status: 'ready', topics: [] });

  renderWithLocalization(
    <AppConfirmationProvider>
      <PublishedVirtualDocumentSurface
        activeNodeId={null}
        nodesById={{}}
        onChangeSortDirection={vi.fn()}
        onChangeSortKey={vi.fn()}
        onSelectNode={vi.fn()}
        sortDirection="desc"
        sortKey="dateSaved"
        trashedNodeIds={[]}
      />
    </AppConfirmationProvider>
  );

  expect(await screen.findByText('Nothing is published')).toBeVisible();
  expect(screen.queryByText('Manage the Topics currently visible on your site.')).not.toBeInTheDocument();
});
