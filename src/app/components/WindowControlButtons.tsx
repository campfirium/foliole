import { Copy, Minus, Square, X } from 'lucide-react';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

interface WindowControlButtonsProps {
  controlsEnabled: boolean;
  isMaximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

export function WindowControlButtons({
  controlsEnabled,
  isMaximized,
  onClose,
  onMinimize,
  onToggleMaximize
}: WindowControlButtonsProps) {
  return (
    <div className="window-titlebar-controls">
      <button aria-label="Minimize" className="window-titlebar-button" disabled={!controlsEnabled} onClick={onMinimize} type="button">
        <Minus aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
      <button
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        className="window-titlebar-button"
        disabled={!controlsEnabled}
        onClick={onToggleMaximize}
        type="button"
      >
        {isMaximized ? (
          <Copy aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        ) : (
          <Square aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        )}
      </button>
      <button
        aria-label="Close"
        className="window-titlebar-button window-titlebar-button-close"
        disabled={!controlsEnabled}
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
    </div>
  );
}
