import type { ReviewSessionMode, ReviewSessionModeAvailability } from '../../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { findEnabledSequentialReadingSourceId } from '../../store/workspaceSequentialReading';

import { useReadActionAdvanceState } from './readActionAdvanceState';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import type { ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import { ReviewToolbarProgressLine } from './ReviewToolbarSessionFrame';
import {
  getReviewCurrentTitle,
  getReviewProgressCounts,
  getReviewSessionModeAvailability
} from './workspaceBottomReviewToolbarModel';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceStudyDockTrigger } from './WorkspaceStudyDock';
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
  isSequentialReadingReviewTopic: boolean;
  reviewCompletedCount: number;
  reviewCurrentNodeId: string | null;
  reviewCurrentTitle: string | undefined;
  reviewProgressCounts?: ReviewToolbarProgressCounts;
  reviewPreview: WorkspaceLayoutProps['review']['reviewPreview'];
  reviewQueueCount: number;
  reviewSummary: WorkspaceLayoutProps['review']['reviewSummary'];
  reviewStatus: WorkspaceLayoutProps['review']['reviewStatus'];
  reviewSessionMode: ReviewSessionMode;
  reviewSessionModeAvailability?: ReviewSessionModeAvailability;
  editorAdapterRef: WorkspaceLayoutProps['document']['editorAdapterRef'];
  onReadReviewTopic: WorkspaceLayoutProps['review']['onReadReviewTopic'];
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
  'document' | 'externalLibrary' | 'layoutChrome' | 'navigation' | 'nodeList' | 'review' | 'trash' | 'virtualView'
>;

type WorkspaceBottomReviewToolbarRenderProps = WorkspaceBottomReviewToolbarProps & {
  readActionAdvanceReady: boolean;
};

function BottomReviewModeToolbar(props: WorkspaceBottomReviewToolbarRenderProps) {
  return (
    <ReviewModeToolbar
      className={`${props.isImmersiveMode ? 'col-start-1 pointer-events-auto' : 'col-start-3 bg-transparent pl-4 pr-0 max-[1080px]:pl-2'} row-start-1 h-full max-[1080px]:col-start-1`}
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
      reviewPreview={props.reviewPreview}
      reviewQueueCount={props.reviewQueueCount}
      reviewSummary={props.reviewSummary}
      reviewStatus={props.reviewStatus}
      readActionAdvanceReady={props.readActionAdvanceReady}
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
      {...definedProps({ reviewSessionModeAvailability: props.reviewSessionModeAvailability })}
      surface={props.isImmersiveMode ? 'overlay' : 'panel'}
    />
  );
}

export function selectWorkspaceBottomReviewToolbarProps(props: WorkspaceBottomReviewToolbarSource): WorkspaceBottomReviewToolbarProps {
  const { externalLibrary, layoutChrome, navigation, review, trash, virtualView } = props;
  const isSequentialReadingReviewTopic = Boolean(
    review.reviewCurrentNodeId &&
      findEnabledSequentialReadingSourceId(review.reviewCurrentNodeId, props.nodeList.nodesById)
  );
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
    isSequentialReadingReviewTopic,
    editorAdapterRef: props.document.editorAdapterRef,
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
    reviewProgressCounts: getReviewProgressCounts(props),
    reviewPreview: review.reviewPreview,
    reviewQueueCount: review.reviewQueueCount,
    reviewSummary: review.reviewSummary,
    reviewStatus: review.reviewStatus,
    reviewSessionMode: review.reviewSessionMode,
    reviewSessionModeAvailability: getReviewSessionModeAvailability(props)
  };
}

function WorkspaceBottomReviewToolbarContent(props: WorkspaceBottomReviewToolbarRenderProps) {
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
  const readActionAdvanceReady = useReadActionAdvanceState({
    editorAdapterRef: props.editorAdapterRef,
    enabled: props.isStudyMode && props.isCurrentReviewItemVisible && !props.isCurrentReviewItemGradable && props.isSequentialReadingReviewTopic,
    resetKey: props.reviewCurrentNodeId
  });
  if (!props.isStudyMode) {
    return null;
  }

  return (
    <div
      className={
        props.isImmersiveMode
          ? 'pointer-events-none absolute inset-x-0 bottom-5 z-workspace-overlay min-w-0'
          : 'col-span-2 row-start-2 min-w-0'
      }
    >
      <div
        className={`${props.isImmersiveMode ? '' : 'workspace-bottom-region-grid'} relative grid min-w-0 ${props.isImmersiveMode ? 'grid-cols-1' : '[grid-template-columns:var(--workspace-rail-width)_minmax(0,1fr)]'}`}
      >
        {props.isImmersiveMode ? null : <WorkspaceSurfaceRowOverlay row="footer" />}
        {props.isImmersiveMode ? null : <WorkspaceFooterRowDividers isListCollapsed={props.isListCollapsed} />}
        {props.isImmersiveMode ? null : (
          <div className="relative z-local-raised">
            <WorkspaceStudyDockTrigger
              canStartStudyMode={props.canStartStudyMode}
              isStudyMode={props.isStudyMode}
              onToggleReviewSession={props.onToggleReviewSession}
            />
          </div>
        )}
        <div className="relative z-local-raised min-w-0">
          <WorkspaceBottomReviewToolbarContent {...props} readActionAdvanceReady={readActionAdvanceReady} />
        </div>
      </div>
    </div>
  );
}
