import { useRef } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { CompactWorkspaceSidebars } from '../hooks/useCompactWorkspaceSidebars';

import { useWorkspaceSidebarHover } from './useWorkspaceSidebarHover';
import { getRightPanelLabel, RIGHT_PANEL_ACTION_ACTIVE_CLASS, RIGHT_PANEL_ACTION_BASE_CLASS } from './WindowTitleBarRightPanelActions';
import { getWorkspaceRightPanelDefinition } from './workspaceRightPanelDefinitions';
import { normalizeWorkspaceRightPanelOrder } from './workspaceRightPanelOrder';
import { loadWorkspaceRightPanelOrderPreference } from './workspaceRightPanelPreference';
import { requestWorkspaceRightPanelOpen } from './workspaceRightPanelRequests';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export function WorkspaceCompactSidebarBackdrop({ sidebars }: { sidebars: CompactWorkspaceSidebars }) {
  const t = useTranslation();
  const edgeRef = useRef<HTMLSpanElement>(null);
  useWorkspaceSidebarHover(sidebars, edgeRef);
  return (
    <>
      {sidebars.hoverEnabled && (sidebars.leftFloating || sidebars.rightFloating) && (
        <span ref={edgeRef} hidden />
      )}
      {sidebars.openSide && !sidebars.isHoverOpen && (
        <button
          aria-label={t('desktop.workspace.closeSidebar')}
          className="absolute inset-0 z-workspace-overlay cursor-default bg-transparent"
          onClick={sidebars.dismiss}
          tabIndex={-1}
          type="button"
        />
      )}
    </>
  );
}

export function WorkspaceCompactRightPanelActions({ activePanelId, hideOnWideWindow }: { activePanelId: WorkspaceRightPanelId; hideOnWideWindow?: boolean | undefined }) {
  const t = useTranslation();
  const order = normalizeWorkspaceRightPanelOrder(loadWorkspaceRightPanelOrderPreference());
  return (
    <div className={`workspace-region-main-sidebar flex h-[var(--workspace-top-toolbar-height)] shrink-0 items-center ${hideOnWideWindow ? 'xl:hidden' : ''}`}>
      <div className="window-titlebar-right-panel-actions">
        {order.map((panelId) => (
          <button
            aria-label={t('desktop.rightPanel.aria', { label: getRightPanelLabel(panelId, t) })}
            aria-pressed={activePanelId === panelId}
            className={`${RIGHT_PANEL_ACTION_BASE_CLASS} ${activePanelId === panelId ? RIGHT_PANEL_ACTION_ACTIVE_CLASS : ''}`}
            data-panel-id={panelId}
            key={panelId}
            onClick={() => requestWorkspaceRightPanelOpen(panelId)}
            type="button"
          >
            {getWorkspaceRightPanelDefinition(panelId).icon}
          </button>
        ))}
      </div>
    </div>
  );
}
