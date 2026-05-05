import { FileSearch, Highlighter, ListOrdered, PanelRight, SlidersHorizontal } from 'lucide-react';
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

function RightSidebarPanelButton({
  active,
  ariaLabel,
  icon,
  onClick
}: {
  active: boolean;
  ariaLabel: string;
  icon: JSX.Element;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={active}
      className="window-titlebar-leading-button"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      {icon}
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
  const isReviewQueuePanelActive = !props.isRightSidebarCollapsed && props.activeRightPanelId === 'review-queue';
  const isSourceInfoPanelActive = !props.isRightSidebarCollapsed && props.activeRightPanelId === 'source-info';
  const isHighlightsPanelActive = !props.isRightSidebarCollapsed && props.activeRightPanelId === 'highlights';
  const isDevPanelActive = !props.isRightSidebarCollapsed && props.activeRightPanelId === 'dev';

  if (props.isRightSidebarCollapsed) {
    return (
      <div className="window-titlebar-collapsed-sidebar-action">
        <RightSidebarToggleButton active={false} onClick={props.onToggleRightSidebarVisibility} />
      </div>
    );
  }

  return (
    <div
      className="window-titlebar-right-anchor-shell"
      style={{ '--workspace-right-sidebar-width': `${props.rightSidebarWidth}px` } as CSSProperties}
    >
      <div className="window-titlebar-right-expanded-action">
        <RightSidebarToggleButton active onClick={props.onToggleRightSidebarVisibility} />
      </div>
      <div className="window-titlebar-right-zone">
        <div className="window-titlebar-right-panel-actions">
          <RightSidebarPanelButton
            active={isReviewQueuePanelActive}
            ariaLabel="Review queue panel"
            icon={<ListOrdered aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
            onClick={() => props.onSelectRightPanel('review-queue')}
          />
          <RightSidebarPanelButton
            active={isSourceInfoPanelActive}
            ariaLabel="Source info panel"
            icon={<FileSearch aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
            onClick={() => props.onSelectRightPanel('source-info')}
          />
          <RightSidebarPanelButton
            active={isHighlightsPanelActive}
            ariaLabel="Highlights panel"
            icon={<Highlighter aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
            onClick={() => props.onSelectRightPanel('highlights')}
          />
          <RightSidebarPanelButton
            active={isDevPanelActive}
            ariaLabel="Dev panel"
            icon={<SlidersHorizontal aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
            onClick={() => props.onSelectRightPanel('dev')}
          />
        </div>
      </div>
    </div>
  );
}
