import { ReviewModeToolbar } from './ReviewModeToolbar';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceStudyDockTrigger } from './WorkspaceSideToolbar';
import {
  WorkspaceFooterRowDividers,
  WorkspaceSurfaceRowOverlay,
  getWorkspaceSurfaceDividerColor
} from './WorkspaceSurfaceRowOverlay';

function WorkspaceBottomReviewToolbarContent({ props }: { props: WorkspaceLayoutProps }) {
  return (
    <div
      className={`grid h-[var(--workspace-bottom-toolbar-height)] min-w-0 overflow-hidden ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1`}
    >
      <div
        className="flex min-w-0 items-center border-t bg-transparent px-4 text-sm font-medium text-foreground/70 max-[1080px]:hidden"
        style={{ borderTopColor: getWorkspaceSurfaceDividerColor('footer', 'folder') }}
      >
        {Math.max(props.reviewQueueCount, 0)} left · {Math.max(props.reviewCompletedCount, 0)} done
      </div>
      <div aria-hidden="true" className="bg-transparent max-[1080px]:hidden" />
      <ReviewModeToolbar
        className="h-full border-t bg-transparent px-6"
        style={{ borderTopColor: getWorkspaceSurfaceDividerColor('footer', 'document') }}
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
          <div
            aria-hidden="true"
            className="hidden border-t bg-transparent xl:block"
            style={{ borderTopColor: getWorkspaceSurfaceDividerColor('footer', 'sidebar') }}
          />
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
    <div
      className={`${props.isImmersiveMode ? 'col-start-1' : 'col-span-2'} row-start-2 min-w-0`}
    >
      <div
        className={`relative grid min-w-0 ${
          props.isImmersiveMode
            ? 'grid-cols-1'
            : '[grid-template-columns:var(--workspace-rail-width)_minmax(0,1fr)]'
        }`}
      >
        {props.isImmersiveMode ? null : <WorkspaceSurfaceRowOverlay row="footer" />}
        {props.isImmersiveMode ? null : <WorkspaceFooterRowDividers />}
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
          <WorkspaceBottomReviewToolbarContent props={props} />
        </div>
      </div>
    </div>
  );
}
