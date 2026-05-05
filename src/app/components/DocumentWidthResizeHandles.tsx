import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

interface DocumentWidthResizeHandlesProps {
  onResetLayout: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
}

interface DocumentWidthHandleProps {
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  side: ResizeSide;
}

function DocumentWidthHandle({ ariaLabel, onPointerDown, onResetLayout, side }: DocumentWidthHandleProps) {
  const style =
    side === 'left'
      ? { left: 'max(0px, calc((100% - min(100%, var(--document-max-width))) / 2 - 5px))' }
      : { right: 'max(0px, calc((100% - min(100%, var(--document-max-width))) / 2 - 5px))' };

  return (
    <div className="pointer-events-none absolute top-0 h-full w-3 max-[1080px]:hidden" data-side={side} style={style}>
      <div
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className={cn(
          'pointer-events-auto absolute top-0 h-full w-2.5 cursor-col-resize before:absolute before:h-full before:border-l before:border-transparent before:transition-colors hover:before:border-border-strong focus-visible:before:border-border-strong',
          side === 'left' ? 'left-0 before:right-0' : 'right-0 before:left-0'
        )}
        onDoubleClick={onResetLayout}
        onMouseDown={onPointerDown}
        onPointerDown={onPointerDown}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}

export function DocumentWidthResizeHandles({
  onResetLayout,
  onStartDocumentResize
}: DocumentWidthResizeHandlesProps) {
  return (
    <>
      <DocumentWidthHandle
        ariaLabel="Resize document width from left"
        onPointerDown={(event) => onStartDocumentResize('left', event)}
        onResetLayout={onResetLayout}
        side="left"
      />
      <DocumentWidthHandle
        ariaLabel="Resize document width from right"
        onPointerDown={(event) => onStartDocumentResize('right', event)}
        onResetLayout={onResetLayout}
        side="right"
      />
    </>
  );
}
