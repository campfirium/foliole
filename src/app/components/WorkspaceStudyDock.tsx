import { Route } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, AppTooltip, AppTooltipContent, AppTooltipTrigger, ToolbarActionGroup } from '../../shared/ui';

import { getWorkspaceSurfaceDividerColor } from './WorkspaceSurfaceRowOverlay';

function FlowAction({
  canStartStudyMode,
  isStudyMode,
  onToggleReviewSession
}: {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
}) {
  const t = useTranslation();
  const actionLabel = isStudyMode
    ? t('desktop.workspace.leaveFlow')
    : canStartStudyMode
      ? t('desktop.workspace.enterFlow')
      : t('desktop.workspace.reviewQueueEmpty');
  return (
    <ToolbarActionGroup
      ariaLabel={t('desktop.workspace.studyActions')}
      className="h-[var(--workspace-bottom-toolbar-height)] w-full justify-center px-1"
      fullWidth
      orientation="vertical"
    >
      <AppTooltip>
        <AppTooltipTrigger asChild>
          <span className="inline-flex">
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-border-strong"
              icon={<Route aria-hidden="true" size={16} strokeWidth={1.75} />}
              label={actionLabel}
              onClick={onToggleReviewSession}
            />
          </span>
        </AppTooltipTrigger>
        <AppTooltipContent>{actionLabel}</AppTooltipContent>
      </AppTooltip>
    </ToolbarActionGroup>
  );
}

export function renderStudyDock(props: {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
  showStudyDock: boolean;
}) {
  if (!props.showStudyDock) {
    return null;
  }
  return (
    <>
      {props.isStudyMode ? (
        <div
          aria-hidden="true"
          className="w-full shrink-0 border-t"
          data-testid="workspace-study-divider"
          style={{ borderTopColor: getWorkspaceSurfaceDividerColor('main', 'rail') }}
        />
      ) : null}
      <div className="flex h-[var(--workspace-bottom-toolbar-height)] w-full shrink-0 items-center justify-center">
        <FlowAction
          canStartStudyMode={props.canStartStudyMode}
          isStudyMode={props.isStudyMode}
          onToggleReviewSession={props.onToggleReviewSession}
        />
      </div>
    </>
  );
}

export function WorkspaceStudyDockTrigger(props: {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
}) {
  return (
    <div
      className="flex h-[var(--workspace-bottom-toolbar-height)] w-[var(--workspace-rail-width)] shrink-0 items-center justify-center"
      style={{ backgroundColor: 'var(--workspace-region-footer-rail-bg)' }}
    >
      <FlowAction
        canStartStudyMode={props.canStartStudyMode}
        isStudyMode={props.isStudyMode}
        onToggleReviewSession={props.onToggleReviewSession}
      />
    </div>
  );
}
