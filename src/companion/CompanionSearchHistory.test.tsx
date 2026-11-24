import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSearchContent } from './CompanionSearchContent';

vi.mock('../shared/platform/companionFullTextSearch', () => ({
  isCompanionSearchTopicAvailable: async () => true,
  searchCompanionFullTextSnapshot: async () => ({ external: [], pdf: [], strategy: 'word-based', topics: [] }),
  supportsCompanionExtendedSearch: () => true
}));

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function topic(id: string, title: string): SnapshotNode {
  return {
    anchorLink: null, content: `# ${title}\n\nBody of ${title}`, createdAt: '2026-04-17T09:00:00.000Z', hideTitleHeading: false,
    id, isTitleManual: false, kind: 'topic', parentNodeId: null, reading: null, reveal: null, review: null, title,
    updatedAt: '2026-04-17T10:00:00.000Z'
  };
}

const snapshot: WorkspaceSnapshot = {
  activeNodeId: null,
  nodeOrder: ['opened', 'unopened'],
  nodesById: { opened: topic('opened', 'Opened Essay'), unopened: topic('unopened', 'Unopened Essay') },
  nodeOpenStateById: { opened: { lastOpenedAt: '2026-04-20T10:00:00.000Z', nodeId: 'opened' } },
  trashedNodeDeletedAtById: {},
  trashedNodeIds: [],
  untitledSequenceByParent: {}
};

describe('CompanionSearchContent open history', () => {
  it('lists recently opened materials before a query and opens them without a search match', async () => {
    const onOpenTopic = vi.fn();
    renderWithLocalization(<CompanionSearchContent onOpenTopic={onOpenTopic} snapshot={snapshot} />);

    expect(screen.getByText('Recently opened')).toBeInTheDocument();
    expect(screen.queryByText('Unopened Essay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Opened Essay/u }));
    await waitFor(() => expect(onOpenTopic).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'opened' }), ''));
  });

  it('hides the history while a query is typed', () => {
    renderWithLocalization(<CompanionSearchContent onOpenTopic={vi.fn()} snapshot={snapshot} />);

    fireEvent.change(screen.getByTestId('companion-search-input'), { target: { value: 'essay' } });
    expect(screen.queryByTestId('companion-search-history')).not.toBeInTheDocument();
  });
});
