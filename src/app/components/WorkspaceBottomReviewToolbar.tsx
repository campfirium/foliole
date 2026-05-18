import type { ReviewGrade } from '../../features/review/model/reviewTypes';

import { ReviewModeToolbar } from './ReviewModeToolbar';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
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
  isCurrentReviewItemVisible: boolean;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewCurrentTitle: string | undefined;
  reviewDueCount: number;
  reviewQueueCount: number;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onExitReviewMode: () => void;
  onGradeReview: (grade: ReviewGrade) => Promise<boolean>;
  onRevealAnswer: () => void;
  onResumeReviewItem: () => void;
  onToggleReviewSession: () => void;
}

export type WorkspaceBottomReviewToolbarSource = Pick<
  WorkspaceLayoutProps,
  'externalLibrary' | 'layoutChrome' | 'navigation' | 'nodeList' | 'review' | 'trash' | 'virtualView'
>;

function getReviewCurrentTitle(source: WorkspaceBottomReviewToolbarSource) {
  const currentNodeId = source.review.reviewCurrentNodeId;
  if (!currentNodeId) {
    return undefined;
  }
  return source.nodeList.nodesById[currentNodeId]?.title;
}

export function selectWorkspaceBottomReviewToolbarProps(
  props: WorkspaceBottomReviewToolbarSource
): WorkspaceBottomReviewToolbarProps {
  const { externalLibrary, layoutChrome, navigation, nodeList, review, trash, virtualView } = props;
  const isCurrentReviewItemVisible = Boolean(
    review.reviewCurrentNodeId &&
      navigation.activeNodeId === review.reviewCurrentNodeId &&
      !externalLibrary.isExternalViewOpen &&
      !trash.isViewingTrashNode &&
      !trash.isTrashViewOpen &&
      !virtualView.isVirtualViewOpen
  );
  return {
    canStartStudyMode: review.canStartStudyMode,
    isAnswerRevealed: review.isAnswerRevealed,
    isCurrentReviewItemGradable: review.isCurrentReviewItemGradable,
    isCurrentReviewItemVisible,
    isImmersiveMode: layoutChrome.isImmersiveMode,
    isListCollapsed: layoutChrome.isListCollapsed,
    isReviewEditing: review.isReviewEditing,
    isStudyMode: review.isStudyMode,
    onCompleteReviewItem: review.onCompleteReviewItem,
    onDeferReviewItem: review.onDeferReviewItem,
    onDismissReviewItem: review.onDismissReviewItem,
    onExitReviewMode: review.onExitReviewMode,
    onGradeReview: review.onGradeReview,
    onRevealAnswer: review.onRevealAnswer,
    onResumeReviewItem: () => {
      if (review.reviewCurrentNodeId) {
        nodeList.onOpenNotesView();
        navigation.onSelectNode(review.reviewCurrentNodeId);
      }
    },
    onToggleReviewSession: review.onToggleReviewSession,
    reviewCompletedCount: review.reviewCompletedCount,
    reviewCurrentNodeId: review.reviewCurrentNodeId,
    reviewCurrentTitle: getReviewCurrentTitle(props),
    reviewDueCount: review.reviewDueCount,
    reviewQueueCount: review.reviewQueueCount
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
        isCurrentReviewItemVisible={props.isCurrentReviewItemVisible}
        isReviewEditing={props.isReviewEditing}
        isStudyMode={props.isStudyMode}
        reviewCompletedCount={props.reviewCompletedCount}
        reviewCurrentNodeId={props.reviewCurrentNodeId}
        reviewCurrentTitle={props.reviewCurrentTitle}
        reviewQueueCount={props.reviewQueueCount}
        onCompleteReviewItem={props.onCompleteReviewItem}
        onDeferReviewItem={props.onDeferReviewItem}
        onDismissReviewItem={props.onDismissReviewItem}
        onExitReviewMode={props.onExitReviewMode}
        onGrade={props.onGradeReview}
        onRevealAnswer={props.onRevealAnswer}
        onResumeReviewItem={props.onResumeReviewItem}
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
          <div className="relative z-local-raised">
            <WorkspaceStudyDockTrigger
              canStartStudyMode={props.canStartStudyMode}
              isStudyMode={props.isStudyMode}
              onToggleReviewSession={props.onToggleReviewSession}
              reviewDueCount={props.reviewDueCount}
            />
          </div>
        )}
        <div className="relative z-local-raised min-w-0">
          <WorkspaceBottomReviewToolbarContent {...props} />
        </div>
      </div>
    </div>
  );
}
