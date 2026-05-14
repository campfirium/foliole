import { PanelLeft, PanelRight } from 'lucide-react';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

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
      aria-label={label}
      className="window-titlebar-leading-button"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      {side === 'left' ? (
        <PanelLeft aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      ) : (
        <PanelRight aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      )}
    </button>
  );
}
