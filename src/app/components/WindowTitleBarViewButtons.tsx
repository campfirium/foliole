import { FileText, FolderTree, Trash2 } from 'lucide-react';
import { memo } from 'react';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

interface WindowTitleBarViewButtonsProps {
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  onOpenNotesView: () => void;
  onOpenVirtualView: () => void;
  onOpenTrashView: () => void;
}

export const WindowTitleBarViewButtons = memo(function WindowTitleBarViewButtons({
  isTrashViewOpen,
  isVirtualViewOpen,
  onOpenNotesView,
  onOpenVirtualView,
  onOpenTrashView
}: WindowTitleBarViewButtonsProps) {
  return (
    <div className="window-titlebar-leading-actions">
      <button
        aria-label="Notes"
        className="window-titlebar-leading-button"
        data-active={!isTrashViewOpen && !isVirtualViewOpen}
        onClick={onOpenNotesView}
        type="button"
      >
        <FileText aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
      <button
        aria-label="Virtual Nodes"
        className="window-titlebar-leading-button"
        data-active={isVirtualViewOpen}
        onClick={onOpenVirtualView}
        type="button"
      >
        <FolderTree aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
      <button
        aria-label="Trash"
        className="window-titlebar-leading-button"
        data-active={isTrashViewOpen}
        onClick={onOpenTrashView}
        type="button"
      >
        <Trash2 aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
    </div>
  );
});
