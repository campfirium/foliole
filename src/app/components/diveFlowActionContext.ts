import { createContext } from 'react';

import type { WorkspaceLayoutReviewProps } from './workspaceLayoutPropGroups';

export const DiveFlowActionContext = createContext<WorkspaceLayoutReviewProps['onOpenDiveFlow']>(undefined);

export type DiveCheckpointTotals = Pick<WorkspaceLayoutReviewProps['reviewSummary'],
  'readTopicCount' | 'readingElapsedMs' | 'reviewedItemCount' | 'reviewElapsedMs'>;

export const DiveFlowCheckpointContext = createContext<{
  dive: import('../../../lib/core/flow/dailyFlowSession').DiveFlowCursor;
  open: NonNullable<WorkspaceLayoutReviewProps['onOpenDiveFlow']>;
  totals: DiveCheckpointTotals;
  snapshot: Parameters<typeof import('../../shared/diveMembership').listVisibleDives>[0];
} | null>(null);
