import { memo, useEffect, useState } from 'react';

import { DESKTOP_GLOBAL_CAPTURE_ACTION } from '../../shared/commands/desktopGlobalCaptureAction';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { isWorkspaceGlobalCaptureAvailable, openWorkspaceGlobalCapture } from '../../shared/platform/desktopHostCapabilities';
import { LucideCatalogIcon } from '../../shared/ui';

import { WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH } from './windowTitleBarLayout';
import { WindowTitleBarRightPanelActions } from './WindowTitleBarRightPanelActions';
import { resolveRightPanelAvailableWidth, resolveVisibleRightPanelCount } from './windowTitleBarRightPanelVisibility';
import { normalizeWorkspaceRightPanelOrder } from './workspaceRightPanelOrder';
import { loadWorkspaceRightPanelOrderPreference, saveWorkspaceRightPanelOrderPreference } from './workspaceRightPanelPreference';
import { WorkspaceSidebarIcon } from './WorkspaceSidebarIcon';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function CapturePanelButton() {
  const t = useTranslation();
  const label = t(DESKTOP_GLOBAL_CAPTURE_ACTION.labelKey);
  return (
    <div className="window-titlebar-right-expanded-action">
      <button
        aria-label={label}
        className="window-titlebar-leading-button pointer-events-auto"
        onClick={() => void openWorkspaceGlobalCapture()}
        title={label}
        type="button"
      >
        <LucideCatalogIcon iconId={DESKTOP_GLOBAL_CAPTURE_ACTION.iconId} />
      </button>
    </div>
  );
}

function RightSidebarToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useTranslation();
  return (
    <button
      data-workspace-sidebar-toggle="right"
      aria-label={t('desktop.workspace.toggleRightSidebar')}
      className="window-titlebar-leading-button pointer-events-auto"
      aria-pressed={active}
      onClick={onClick}
      type="button"
    >
      <WorkspaceSidebarIcon active={active} side="right" />
    </button>
  );
}

interface WindowTitleBarRightSidebarAnchorProps {
  activeRightPanelId: WorkspaceRightPanelId;
  controlsWidth: number;
  isRightSidebarCollapsed: boolean;
  isRightSidebarFloating?: boolean | undefined;
  keepFloatingSidebarControls?: boolean | undefined;
  dockedRightCollapsed?: boolean | undefined;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleRightSidebarVisibility: () => void;
  rightSidebarWidth: number;
}

function useWorkspaceRightPanelOrder() {
  const [orderedPanelIds, setOrderedPanelIds] = useState<WorkspaceRightPanelId[]>(() =>
    normalizeWorkspaceRightPanelOrder(loadWorkspaceRightPanelOrderPreference())
  );

  useEffect(() => {
    saveWorkspaceRightPanelOrderPreference(orderedPanelIds);
  }, [orderedPanelIds]);

  return {
    orderedPanelIds,
    setOrderedPanelIds
  };
}

export const WindowTitleBarRightSidebarAnchor = memo(function WindowTitleBarRightSidebarAnchor(
  props: WindowTitleBarRightSidebarAnchorProps
) {
  const isCollapsed = props.isRightSidebarCollapsed;
  const temporarilyHidden = props.keepFloatingSidebarControls && props.isRightSidebarFloating;
  const toggleActive = temporarilyHidden ? !props.dockedRightCollapsed : !isCollapsed;
  const hidePanelActions = (isCollapsed || props.isRightSidebarFloating) &&
    !(props.keepFloatingSidebarControls && props.isRightSidebarFloating);
  const orderState = useWorkspaceRightPanelOrder();
  const showCapture = isWorkspaceGlobalCaptureAvailable();
  const captureWidth = showCapture ? WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH : 0;
  const visiblePanelCount = resolveVisibleRightPanelCount({
    availableWidth: resolveRightPanelAvailableWidth({
      controlsWidth: props.controlsWidth,
      rightSidebarWidth: props.rightSidebarWidth
    }) - captureWidth,
    panelCount: orderState.orderedPanelIds.length
  });

  return (
    <div className="window-titlebar-right-anchor-shell relative z-local-control" data-collapsed={isCollapsed}>
      <div className="window-titlebar-right-content" data-collapsed={isCollapsed}>
        <div className="window-titlebar-right-zone max-[1279px]:hidden" hidden={hidePanelActions} style={{ pointerEvents: 'none' }}>
          {hidePanelActions
            ? null
            : <WindowTitleBarRightPanelActions
                activeRightPanelId={props.activeRightPanelId}
                onSelectRightPanel={props.onSelectRightPanel}
                orderedPanelIds={orderState.orderedPanelIds}
                setOrderedPanelIds={orderState.setOrderedPanelIds}
                visiblePanelCount={visiblePanelCount}
              />}
        </div>
        {showCapture ? <CapturePanelButton /> : null}
        <div className="window-titlebar-right-expanded-action">
          <RightSidebarToggleButton active={toggleActive} onClick={props.onToggleRightSidebarVisibility} />
        </div>
      </div>
    </div>
  );
});
