import { FileSearch, Gauge, Highlighter, Link2, ListOrdered, PanelRight, SlidersHorizontal } from 'lucide-react';
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

function renderRightSidebarPanelActions(props: Pick<WindowTitleBarRightSidebarAnchorProps, 'activeRightPanelId' | 'onSelectRightPanel'>) {
  const isActive = (panelId: WorkspaceRightPanelId) => props.activeRightPanelId === panelId;
  return (
    <div className="window-titlebar-right-panel-actions">
      <RightSidebarPanelButton
        active={isActive('review-queue')}
        ariaLabel="Review queue panel"
        icon={<ListOrdered aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
        onClick={() => props.onSelectRightPanel('review-queue')}
      />
      <RightSidebarPanelButton
        active={isActive('source-info')}
        ariaLabel="Source info panel"
        icon={<FileSearch aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
        onClick={() => props.onSelectRightPanel('source-info')}
      />
      <RightSidebarPanelButton
        active={isActive('highlights')}
        ariaLabel="Highlights panel"
        icon={<Highlighter aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
        onClick={() => props.onSelectRightPanel('highlights')}
      />
      <RightSidebarPanelButton
        active={isActive('backlinks')}
        ariaLabel="Backlinks panel"
        icon={<Link2 aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
        onClick={() => props.onSelectRightPanel('backlinks')}
      />
      <RightSidebarPanelButton
        active={isActive('performance')}
        ariaLabel="Performance panel"
        icon={<Gauge aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
        onClick={() => props.onSelectRightPanel('performance')}
      />
      <RightSidebarPanelButton
        active={isActive('dev')}
        ariaLabel="Dev panel"
        icon={<SlidersHorizontal aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />}
        onClick={() => props.onSelectRightPanel('dev')}
      />
    </div>
  );
}

export function WindowTitleBarRightSidebarAnchor(props: WindowTitleBarRightSidebarAnchorProps) {
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
        {renderRightSidebarPanelActions(props)}
      </div>
    </div>
  );
}
