import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

const publishMocks = vi.hoisted(() => ({
  loadFoliolePublishedTopicsFromRuntime: vi.fn(),
  migrateFoliolePublishedTopicsFromRuntime: vi.fn(),
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
  useWorkspaceStore.setState({ isHydrated: true, workspaceHydrationError: null });
});

it('projects active and missing-source pages from publish data', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({
    status: 'ready',
    topics: [
      {
        node_id: 'topic-1', number: 1, source_key: 'node:topic-1', source_state: 'active',
        title: 'Active Topic', updated_at: '2026-07-24T00:00:00.000Z', url: 'https://example.com/topics/1/'
      },
      {
        node_id: null, number: 2, source_key: 'orphan:2', source_state: 'missing',
        title: 'Missing Topic', updated_at: '2026-07-24T00:00:00.000Z', url: 'https://example.com/topics/2/'
      }
    ]
  });

  renderWithLocalization(
    <AppConfirmationProvider>
      <PublishedVirtualDocumentSurface
        activeNodeId={null}
        nodeOrder={[]}
        nodesById={{ 'topic-1': topicNode }}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </AppConfirmationProvider>
  );

  expect(await screen.findByText('Active Topic')).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Active Topic' })).toBeVisible();
  expect(screen.queryByText('Manage the Topics currently visible on your site.')).not.toBeInTheDocument();
  expect(screen.getByText('Missing Topic')).toBeVisible();
  expect(screen.getByText('The original Topic is unavailable. You can still unpublish this page.')).toBeVisible();
});

it('uses the shared virtual list empty state without a Published description header', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({ status: 'ready', topics: [] });

  renderWithLocalization(
    <AppConfirmationProvider>
      <PublishedVirtualDocumentSurface
        activeNodeId={null}
        nodeOrder={[]}
        nodesById={{}}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </AppConfirmationProvider>
  );

  expect(await screen.findByText('Nothing is published')).toBeVisible();
  expect(screen.queryByText('Manage the Topics currently visible on your site.')).not.toBeInTheDocument();
});
