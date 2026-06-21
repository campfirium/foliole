import { PanelRight } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { WindowTitleBarRightPanelActions } from './WindowTitleBarRightPanelActions';
import { resolveRightPanelAvailableWidth, resolveVisibleRightPanelCount } from './windowTitleBarRightPanelVisibility';
import { normalizeWorkspaceRightPanelOrder } from './workspaceRightPanelOrder';
import { loadWorkspaceRightPanelOrderPreference, saveWorkspaceRightPanelOrderPreference } from './workspaceRightPanelPreference';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

function RightSidebarToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useTranslation();
  return (
    <button
      aria-label={t('desktop.workspace.toggleRightSidebar')}
      className="window-titlebar-leading-button pointer-events-auto"
      aria-pressed={active}
      onClick={onClick}
      type="button"
    >
      <PanelRight aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
    </button>
  );
}

interface WindowTitleBarRightSidebarAnchorProps {
  activeRightPanelId: WorkspaceRightPanelId;
  controlsWidth: number;
  isRightSidebarCollapsed: boolean;
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
  const orderState = useWorkspaceRightPanelOrder();
  const visiblePanelCount = resolveVisibleRightPanelCount({
    availableWidth: resolveRightPanelAvailableWidth({
      controlsWidth: props.controlsWidth,
      rightSidebarWidth: props.rightSidebarWidth
    }),
    panelCount: orderState.orderedPanelIds.length
  });

  return (
    <div className="window-titlebar-right-anchor-shell relative z-local-control max-[1279px]:hidden" data-collapsed={isCollapsed}>
      <div className="window-titlebar-right-content" data-collapsed={isCollapsed}>
        <div className="window-titlebar-right-expanded-action">
          <RightSidebarToggleButton active={!isCollapsed} onClick={props.onToggleRightSidebarVisibility} />
        </div>
        <div className="window-titlebar-right-zone max-[1279px]:hidden" hidden={isCollapsed} style={{ pointerEvents: 'none' }}>
          {isCollapsed
            ? null
            : <WindowTitleBarRightPanelActions
                activeRightPanelId={props.activeRightPanelId}
                onSelectRightPanel={props.onSelectRightPanel}
                orderedPanelIds={orderState.orderedPanelIds}
                setOrderedPanelIds={orderState.setOrderedPanelIds}
                visiblePanelCount={visiblePanelCount}
              />}
        </div>
      </div>
    </div>
  );
});
