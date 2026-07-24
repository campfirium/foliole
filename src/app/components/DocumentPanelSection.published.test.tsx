import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const publishMocks = vi.hoisted(() => ({ loadFoliolePublishedTopicsFromRuntime: vi.fn() }));
vi.mock('../../shared/platform/foliolePublishRepository', () => publishMocks);

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.testSupport';

it('shows the Published content list when the Published directory is selected', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({
    status: 'ready',
    topics: [{
      node_id: 'topic-1', number: 1, source_key: 'source-1', source_state: 'active',
      title: 'Published Topic', updated_at: '2026-07-24T00:00:00.000Z', url: null
    }]
  });

  renderSectionWithProps({
    activeNodeId: null,
    activeVirtualNodeId: 'special-virtual-published',
    editableNodeId: null,
    editorNodeId: null,
    isFoliolePublishedContext: true,
    nodeOrder: ['topic-1'],
    nodesById: { 'topic-1': { ...baseNode, id: 'topic-1', title: 'Published Topic' } }
  });

  expect(await screen.findByRole('region', { name: 'Published topics' })).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'Search Topics published to your site' })).toBeVisible();
  expect(screen.getByText('Published Topic')).toBeVisible();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});
