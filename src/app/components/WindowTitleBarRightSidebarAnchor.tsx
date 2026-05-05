import { Bug, PanelRight } from 'lucide-react';
import type { CSSProperties } from 'react';

import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

function RightSidebarToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      aria-label="Toggle right sidebar"
      className="window-titlebar-leading-button"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      <PanelRight aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
    </button>
  );
}

interface WindowTitleBarRightSidebarAnchorProps {
  activeRightPanelId: WorkspaceRightPanelId;
  isRightSidebarCollapsed: boolean;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleRightSidebarVisibility: () => void;
  rightSidebarWidth: number;
}

export function WindowTitleBarRightSidebarAnchor(props: WindowTitleBarRightSidebarAnchorProps) {
  const isDevPanelActive = !props.isRightSidebarCollapsed && props.activeRightPanelId === 'dev';

  return (
    <div
      className="window-titlebar-right-anchor-shell"
      style={{ '--workspace-right-sidebar-width': `${props.rightSidebarWidth}px` } as CSSProperties}
    >
      <div className="window-titlebar-right-expanded-action">
        <button
          aria-label="Dev panel"
          aria-pressed={isDevPanelActive}
          className="window-titlebar-leading-button"
          data-active={isDevPanelActive}
          onClick={() => props.onSelectRightPanel('dev')}
          type="button"
        >
          <Bug aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        </button>
      </div>
      {!props.isRightSidebarCollapsed ? (
        <div className="window-titlebar-right-expanded-action" style={{ left: 38 }}>
          <RightSidebarToggleButton active onClick={props.onToggleRightSidebarVisibility} />
        </div>
      ) : null}
      {!props.isRightSidebarCollapsed ? <div className="window-titlebar-right-zone" /> : null}
      {props.isRightSidebarCollapsed ? (
        <div className="window-titlebar-collapsed-sidebar-action">
          <RightSidebarToggleButton active={false} onClick={props.onToggleRightSidebarVisibility} />
        </div>
      ) : null}
    </div>
  );
}
