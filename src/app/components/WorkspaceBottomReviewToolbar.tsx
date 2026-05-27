import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';

import { ReviewModeToolbar } from './ReviewModeToolbar';
import type { ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import { ReviewToolbarProgressLine } from './ReviewToolbarSessionFrame';
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
  reviewProgressCounts?: ReviewToolbarProgressCounts;
  reviewQueueCount: number;
  reviewSummary: WorkspaceLayoutProps['review']['reviewSummary'];
  reviewStatus: WorkspaceLayoutProps['review']['reviewStatus'];
  reviewSessionMode: ReviewSessionMode;
  onReadReviewTopic: () => Promise<boolean>;
  onPostponeReviewTopic: () => Promise<boolean>;
  onDismissReviewTopic: () => Promise<boolean>;
  onRevisitReviewTopicSoon: () => Promise<boolean>;
  onContinueReading: () => void;
  onExitReviewMode: () => void;
  onGradeReview: (grade: ReviewGrade) => Promise<boolean>;
  onRevealAnswer: () => void;
  onResumeReviewItem: () => void;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
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

function getReviewProgressCounts(source: WorkspaceBottomReviewToolbarSource): ReviewToolbarProgressCounts {
  const existingCounts = (source.review as Partial<WorkspaceBottomReviewToolbarProps>).reviewProgressCounts;
  if (existingCounts) return existingCounts;

  const queueNodeIds = (source.review as { reviewQueueNodeIds?: string[] }).reviewQueueNodeIds ?? [];
  let queuedItemCount = 0;
  let queuedTopicCount = 0;
  for (const nodeId of queueNodeIds) {
    const kind = source.nodeList.nodesById[nodeId]?.kind;
    if (kind === 'item') queuedItemCount += 1;
    if (kind === 'topic') queuedTopicCount += 1;
  }
  return {
    completedItemCount: source.review.reviewSummary.reviewedItemCount,
    completedTopicCount: source.review.reviewSummary.readTopicCount,
    queuedItemCount,
    queuedTopicCount
  };
}

function BottomReviewModeToolbar(props: WorkspaceBottomReviewToolbarProps) {
  return (
    <ReviewModeToolbar
      className="col-start-3 row-start-1 h-full bg-transparent px-6 max-[1080px]:col-start-1"
      style={{ borderTopColor: 'transparent' }}
      showProgress={false}
      showSessionModeControl
      showSummary={false}
      isAnswerRevealed={props.isAnswerRevealed}
      isCurrentItemGradable={props.isCurrentReviewItemGradable}
      isCurrentReviewItemVisible={props.isCurrentReviewItemVisible}
      isReviewEditing={props.isReviewEditing}
      isStudyMode={props.isStudyMode}
      reviewCompletedCount={props.reviewCompletedCount}
      reviewCurrentNodeId={props.reviewCurrentNodeId}
      reviewCurrentTitle={props.reviewCurrentTitle}
      {...definedProps({ reviewProgressCounts: props.reviewProgressCounts })}
      reviewQueueCount={props.reviewQueueCount}
      reviewSummary={props.reviewSummary}
      reviewStatus={props.reviewStatus}
      onReadReviewTopic={props.onReadReviewTopic}
      onContinueReading={props.onContinueReading}
      onPostponeReviewTopic={props.onPostponeReviewTopic}
      onDismissReviewTopic={props.onDismissReviewTopic}
      onRevisitReviewTopicSoon={props.onRevisitReviewTopicSoon}
      onExitReviewMode={props.onExitReviewMode}
      onGrade={props.onGradeReview}
      onRevealAnswer={props.onRevealAnswer}
      onResumeReviewItem={props.onResumeReviewItem}
      onSetReviewSessionMode={props.onSetReviewSessionMode}
      reviewSessionMode={props.reviewSessionMode}
    />
  );
}

export function selectWorkspaceBottomReviewToolbarProps(props: WorkspaceBottomReviewToolbarSource): WorkspaceBottomReviewToolbarProps {
  const { externalLibrary, layoutChrome, navigation, review, trash, virtualView } = props;
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
    onReadReviewTopic: review.onReadReviewTopic,
    onContinueReading: review.onContinueReading,
    onPostponeReviewTopic: review.onPostponeReviewTopic,
    onDismissReviewTopic: review.onDismissReviewTopic,
    onRevisitReviewTopicSoon: review.onRevisitReviewTopicSoon,
    onExitReviewMode: review.onExitReviewMode,
    onGradeReview: review.onGradeReview,
    onRevealAnswer: review.onRevealAnswer,
    onResumeReviewItem: review.onResumeReviewItem,
    onSetReviewSessionMode: review.onSetReviewSessionMode,
    onToggleReviewSession: review.onToggleReviewSession,
    reviewCompletedCount: review.reviewCompletedCount,
    reviewCurrentNodeId: review.reviewCurrentNodeId,
    reviewCurrentTitle: getReviewCurrentTitle(props),
    reviewDueCount: review.reviewDueCount,
    reviewProgressCounts: getReviewProgressCounts(props),
    reviewQueueCount: review.reviewQueueCount,
    reviewSummary: review.reviewSummary,
    reviewStatus: review.reviewStatus,
    reviewSessionMode: review.reviewSessionMode
  };
}

function WorkspaceBottomReviewToolbarContent(props: WorkspaceBottomReviewToolbarProps) {
  const showReviewProgressLine = props.isCurrentReviewItemGradable && props.reviewStatus !== 'completed' && props.reviewStatus !== 'idle';
  return (
    <div
      className={`grid h-[var(--workspace-bottom-toolbar-height)] min-w-0 overflow-visible ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1`}
    >
      {props.isListCollapsed ? null : (
        <>
          <div aria-hidden="true" className="bg-transparent max-[1080px]:hidden" />
          <div aria-hidden="true" className="bg-transparent max-[1080px]:hidden" />
        </>
      )}
      <BottomReviewModeToolbar {...props} />
      <div className="pointer-events-none relative z-workspace-overlay col-start-3 row-start-1 h-full max-[1080px]:col-start-1">
        {showReviewProgressLine ? (
          <ReviewToolbarProgressLine
            completedCount={props.reviewCompletedCount}
            {...definedProps({ progressCounts: props.reviewProgressCounts })}
            queueCount={props.reviewQueueCount}
            reviewSessionMode={props.reviewSessionMode}
          />
        ) : null}
      </div>
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
    <div className={`${props.isImmersiveMode ? 'col-start-1' : 'col-span-2'} row-start-2 min-w-0`}>
      <div
        className={`workspace-bottom-region-grid relative grid min-w-0 ${props.isImmersiveMode ? 'grid-cols-1' : '[grid-template-columns:var(--workspace-rail-width)_minmax(0,1fr)]'}`}
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
