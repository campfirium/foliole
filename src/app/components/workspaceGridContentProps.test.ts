import { expect, it } from 'vitest';

import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import {
  resolveAssistantMainPanelNodeId,
  selectStudySessionCompleteSummaryProps
} from './workspaceGridContentProps';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

function createProjectionSource(canContinueReading: boolean): WorkspaceGridContentProjectionSource {
  return {
    review: {
      isStudyMode: true,
      reviewSessionMode: 'recommended',
      reviewStatus: 'completed',
      reviewSummary: {
        canContinueReading,
        completedAt: '2026-06-23T00:00:00.000Z',
        continueNodeId: 'reading-1',
        createdItemCount: 0,
        createdTopicCount: 0,
        nextReviewDueAt: null,
        readingElapsedMs: 0,
        readTopicCount: 8,
        reviewElapsedMs: 0,
        reviewedItemCount: 1,
        sessionStartedAt: '2026-06-23T00:00:00.000Z'
      }
    } as WorkspaceLayoutProps['review']
  } as WorkspaceGridContentProjectionSource;
}

it('projects the queue-clear summary only when the completed Flow has reading to continue', () => {
  expect(selectStudySessionCompleteSummaryProps(createProjectionSource(true))).toMatchObject({
    readTopicCount: 8,
    reviewedItemCount: 1
  });

  expect(selectStudySessionCompleteSummaryProps(createProjectionSource(false))).toBeNull();
});

it('uses the visible virtual collection as the assistant context instead of a stale document topic', () => {
  expect(resolveAssistantMainPanelNodeId({
    documentNodeId: 'previous-topic',
    props: {
      virtualView: {
        activeVirtualNodeId: 'virtual-collection',
        isVirtualViewOpen: true
      } as WorkspaceLayoutProps['virtualView']
    }
  })).toBe('virtual-collection');
});

it('uses the document node as the assistant context outside virtual views', () => {
  expect(resolveAssistantMainPanelNodeId({
    documentNodeId: 'topic-1',
    props: {
      virtualView: {
        activeVirtualNodeId: 'virtual-collection',
        isVirtualViewOpen: false
      } as WorkspaceLayoutProps['virtualView']
    }
  })).toBe('topic-1');
});
