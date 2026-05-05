import { ReviewModeToolbar } from './ReviewModeToolbar';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceStudyDockTrigger } from './WorkspaceSideToolbar';

function WorkspaceBottomReviewToolbarContent({ props }: { props: WorkspaceLayoutProps }) {
  return (
    <div
      className={`workspace-bottom-region-grid grid h-[var(--workspace-bottom-toolbar-height)] min-w-0 overflow-hidden ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1`}
    >
      <div className="flex min-w-0 items-center border-t border-border bg-transparent px-4 text-sm font-medium text-foreground/70 max-[1080px]:hidden">
        {Math.max(props.reviewQueueCount, 0)} left · {Math.max(props.reviewCompletedCount, 0)} done
      </div>
      <div aria-hidden="true" className="bg-border max-[1080px]:hidden" />
      <ReviewModeToolbar
        className="h-full border-t border-border bg-transparent px-6"
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
          <div aria-hidden="true" className="hidden bg-border xl:block" />
          <div aria-hidden="true" className="hidden border-t border-border bg-transparent xl:block" />
        </>
      )}
    </div>
  );
}

export function WorkspaceBottomReviewToolbar({ props }: { props: WorkspaceLayoutProps }) {
  if (!props.isStudyMode) {
    return null;
  }

  return (
    <>
      {props.isImmersiveMode ? null : (
        <div className="row-start-2">
          <WorkspaceStudyDockTrigger
            canStartStudyMode={props.canStartStudyMode}
            isStudyMode={props.isStudyMode}
            onToggleReviewSession={props.onToggleReviewSession}
            reviewDueCount={props.reviewDueCount}
          />
        </div>
      )}
      <div className={`${props.isImmersiveMode ? 'col-start-1' : 'col-start-2'} row-start-2 min-w-0`}>
        <WorkspaceBottomReviewToolbarContent props={props} />
      </div>
    </>
  );
}
