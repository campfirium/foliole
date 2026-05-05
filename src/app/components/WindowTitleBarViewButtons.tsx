import { FileText } from 'lucide-react';
import { memo } from 'react';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

interface WindowTitleBarViewButtonsProps {
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
}

export const WindowTitleBarViewButtons = memo(function WindowTitleBarViewButtons({
  isTrashViewOpen,
  onOpenNotesView
}: WindowTitleBarViewButtonsProps) {
  return (
    <div className="window-titlebar-leading-actions">
      <button
        aria-label="Notes"
        className="window-titlebar-leading-button"
        data-active={!isTrashViewOpen}
        onClick={onOpenNotesView}
        type="button"
      >
        <FileText aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
    </div>
  );
});
