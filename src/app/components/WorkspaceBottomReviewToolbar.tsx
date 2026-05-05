import type { ReviewGrade } from '../../features/review/model/reviewTypes';

import { ReviewModeToolbar } from './ReviewModeToolbar';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import { WorkspaceStudyDockTrigger } from './WorkspaceSideToolbar';
import { WorkspaceFooterRowDividers, WorkspaceSurfaceRowOverlay } from './WorkspaceSurfaceRowOverlay';

export interface WorkspaceBottomReviewToolbarProps {
  canStartStudyMode: boolean;
  isAnswerRevealed: boolean;
  isCurrentReviewItemGradable: boolean;
  isImmersiveMode: boolean;
  isListCollapsed: boolean;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewDueCount: number;
  reviewQueueCount: number;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onExitReviewMode: () => void;
  onGradeReview: (grade: ReviewGrade) => Promise<boolean>;
  onRevealAnswer: () => void;
  onToggleReviewSession: () => void;
}

export interface WorkspaceBottomReviewToolbarSource {
  canStartStudyMode: boolean;
  isAnswerRevealed: boolean;
  isCurrentReviewItemGradable: boolean;
  isImmersiveMode: boolean;
  isListCollapsed: boolean;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onExitReviewMode: () => void;
  onGradeReview: (grade: ReviewGrade) => Promise<boolean>;
  onRevealAnswer: () => void;
  onToggleReviewSession: () => void;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewDueCount: number;
  reviewQueueCount: number;
}

export function selectWorkspaceBottomReviewToolbarProps(
  props: WorkspaceBottomReviewToolbarSource
): WorkspaceBottomReviewToolbarProps {
  return {
    canStartStudyMode: props.canStartStudyMode,
    isAnswerRevealed: props.isAnswerRevealed,
    isCurrentReviewItemGradable: props.isCurrentReviewItemGradable,
    isImmersiveMode: props.isImmersiveMode,
    isListCollapsed: props.isListCollapsed,
    isReviewEditing: props.isReviewEditing,
    isStudyMode: props.isStudyMode,
    onCompleteReviewItem: props.onCompleteReviewItem,
    onDeferReviewItem: props.onDeferReviewItem,
    onDismissReviewItem: props.onDismissReviewItem,
    onExitReviewMode: props.onExitReviewMode,
    onGradeReview: props.onGradeReview,
    onRevealAnswer: props.onRevealAnswer,
    onToggleReviewSession: props.onToggleReviewSession,
    reviewCompletedCount: props.reviewCompletedCount,
    reviewCurrentNodeId: props.reviewCurrentNodeId,
    reviewDueCount: props.reviewDueCount,
    reviewQueueCount: props.reviewQueueCount
  };
}

function WorkspaceBottomReviewToolbarContent(props: WorkspaceBottomReviewToolbarProps) {
  return (
    <div
      className={`grid h-[var(--workspace-bottom-toolbar-height)] min-w-0 overflow-hidden ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1`}
    >
      {props.isListCollapsed ? null : (
        <>
          <div className="flex min-w-0 items-center bg-transparent px-4 text-sm font-medium text-foreground/70 max-[1080px]:hidden">
            {Math.max(props.reviewQueueCount, 0)} left · {Math.max(props.reviewCompletedCount, 0)} done
          </div>
          <div aria-hidden="true" className="bg-transparent max-[1080px]:hidden" />
        </>
      )}
      <ReviewModeToolbar
        className="col-start-3 h-full bg-transparent px-6 max-[1080px]:col-start-1"
        style={{ borderTopColor: 'transparent' }}
        showSummary={false}
        isAnswerRevealed={props.isAnswerRevealed}
        isCurrentItemGradable={props.isCurrentReviewItemGradable}
        isReviewEditing={props.isReviewEditing}
        isStudyMode={props.isStudyMode}
        reviewCompletedCount={props.reviewCompletedCount}
        reviewCurrentNodeId={props.reviewCurrentNodeId}
        reviewQueueCount={props.reviewQueueCount}
        onCompleteReviewItem={props.onCompleteReviewItem}
        onDeferReviewItem={props.onDeferReviewItem}
        onDismissReviewItem={props.onDismissReviewItem}
        onExitReviewMode={props.onExitReviewMode}
        onGrade={props.onGradeReview}
        onRevealAnswer={props.onRevealAnswer}
      />
      {props.isImmersiveMode ? null : (
        <>
          <div aria-hidden="true" className="hidden bg-transparent xl:block" />
          <div aria-hidden="true" className="hidden bg-transparent xl:block" />
        </>
      )}
    </div>
  );
}

export function WorkspaceBottomReviewToolbar(props: WorkspaceBottomReviewToolbarProps) {
  if (!props.isStudyMode) {
    return null;
  }

  return (
    <div
      className={`${props.isImmersiveMode ? 'col-start-1' : 'col-span-2'} row-start-2 min-w-0`}
    >
      <div
        className={`workspace-bottom-region-grid relative grid min-w-0 ${
          props.isImmersiveMode
            ? 'grid-cols-1'
            : '[grid-template-columns:var(--workspace-rail-width)_minmax(0,1fr)]'
        }`}
      >
        {props.isImmersiveMode ? null : <WorkspaceSurfaceRowOverlay row="footer" />}
        {props.isImmersiveMode ? null : <WorkspaceFooterRowDividers isListCollapsed={props.isListCollapsed} />}
        {props.isImmersiveMode ? null : (
          <div className="relative z-[1]">
            <WorkspaceStudyDockTrigger
              canStartStudyMode={props.canStartStudyMode}
              isStudyMode={props.isStudyMode}
              onToggleReviewSession={props.onToggleReviewSession}
              reviewDueCount={props.reviewDueCount}
            />
          </div>
        )}
        <div className="relative z-[1] min-w-0">
          <WorkspaceBottomReviewToolbarContent {...props} />
        </div>
      </div>
    </div>
  );
}
