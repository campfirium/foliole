import { WorkspaceSidebarIcon } from './WorkspaceSidebarIcon';

interface WindowSidebarToggleButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  side: 'left' | 'right';
}

export function WindowSidebarToggleButton({
  active,
  label,
  onClick,
  side
}: WindowSidebarToggleButtonProps) {
  return (
    <button
      data-workspace-sidebar-toggle={side}
      aria-label={label}
      className="window-titlebar-leading-button"
      aria-pressed={active}
      onClick={onClick}
      type="button"
    >
      <WorkspaceSidebarIcon active={active} side={side} />
    </button>
  );
}
