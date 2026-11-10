import { useEffect, useState } from 'react';

import { readDiveNode } from '../../../lib/core/nodes/dive';
import { FlowExitHereContext } from '../../shared/ui/FlowExitHereContext';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { DiveFlowActionContext, DiveFlowCheckpointContext, type DiveCheckpointTotals } from './diveFlowActionContext';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';
export type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
export type { WorkspaceEditorContextMenu } from './workspaceLayoutProps';

function useDiveTotals(id: string | undefined, summary: DiveCheckpointTotals): DiveCheckpointTotals {
  const [baseline, setBaseline] = useState(() => ({ id, summary }));
  if (baseline.id !== id) setBaseline({ id, summary });
  const initial = baseline.id === id ? baseline.summary : summary;
  return {
    readTopicCount: Math.max(0, summary.readTopicCount - initial.readTopicCount),
    readingElapsedMs: Math.max(0, summary.readingElapsedMs - initial.readingElapsedMs),
    reviewedItemCount: Math.max(0, summary.reviewedItemCount - initial.reviewedItemCount),
    reviewElapsedMs: Math.max(0, summary.reviewElapsedMs - initial.reviewElapsedMs)
  };
}

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const dive = useWorkspaceStore(state => state.reviewSession.dive);
  const open = props.review.onOpenDiveFlow;
  const totals = useDiveTotals(dive?.id, props.review.reviewSummary);
  const diveExists = useWorkspaceStore(state => Boolean(dive && readDiveNode(state.nodesById[dive.id]) &&
    !state.trashedNodeIds.includes(dive.id)));
  const unavailable = props.layoutChrome.isWorkspaceHydrated && props.review.isStudyMode && Boolean(dive && !diveExists);
  const shouldExit = unavailable && !props.review.reviewCurrentNodeId;
  const exitReview = props.review.onExitReviewMode;
  useEffect(() => {
    if (shouldExit) exitReview();
  }, [shouldExit, exitReview]);
  const checkpoint = !unavailable && props.review.isStudyMode && dive?.stop && !props.review.reviewCurrentNodeId && open
    ? { dive, open, totals, snapshot: { nodesById: props.nodeList.nodesById, nodeOrder: props.nodeList.nodeOrder,
      trashedNodeIds: props.trash.trashedNodeIds } } : null;
  const canExitHere = props.review.isStudyMode && props.navigation.activeNodeId
    && props.navigation.activeNodeId !== props.review.reviewCurrentNodeId
    && !props.externalLibrary.isExternalViewOpen && !props.trash.isTrashViewOpen;
  return <FlowExitHereContext.Provider value={canExitHere ? props.review.onExitFlowHere ?? null : null}>
    <DiveFlowActionContext.Provider value={props.review.onOpenDiveFlow}>
      <DiveFlowCheckpointContext.Provider value={checkpoint}>
        <WorkspaceLayoutMain {...props} />
      </DiveFlowCheckpointContext.Provider>
    </DiveFlowActionContext.Provider>
  </FlowExitHereContext.Provider>;
}
