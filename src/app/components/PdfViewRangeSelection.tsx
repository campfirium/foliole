import { useRef, type PointerEvent } from 'react';

import type { PdfViewRect } from '../../features/pdf/model/pdfReadingView';

import { clampPdfNormalizedRect, rectFromPointerDrag } from './pdfVisualExcerptGeometry';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw';
interface Drag {
  kind: Handle;
  x: number;
  y: number;
  rect: PdfViewRect;
}
export function resolveViewRangeDrag(drag: Drag, x: number, y: number): PdfViewRect {
  const rect = drag.rect;
  if (drag.kind === 'draw') return rectFromPointerDrag(drag.x, drag.y, x, y);
  if (drag.kind === 'move')
    return {
      ...rect,
      x: Math.max(0, Math.min(1 - rect.width, rect.x + x - drag.x)),
      y: Math.max(0, Math.min(1 - rect.height, rect.y + y - drag.y))
    };
  const anchorX = drag.kind.endsWith('w') ? rect.x + rect.width : rect.x;
  const anchorY = drag.kind.startsWith('n') ? rect.y + rect.height : rect.y;
  return rectFromPointerDrag(anchorX, anchorY, x, y);
}
interface RangeSelectionProps {
  rect: PdfViewRect;
  drawOnBody?: boolean;
  onChange: (rect: PdfViewRect) => void;
}
const corners: Handle[] = ['nw', 'ne', 'sw', 'se'];
function useRangePointerHandlers(props: RangeSelectionProps) {
  const drag = useRef<Drag | null>(null);
  const pointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const target = event.target instanceof HTMLElement ? event.target.dataset.handle : undefined;
      const kind =
        corners.find((corner) => corner === target) ??
        (target === 'move' && !props.drawOnBody ? 'move' : 'draw');
      drag.current = { ...pointer(event), kind, rect: props.rect };
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const point = pointer(event);
      props.onChange(resolveViewRangeDrag(drag.current, point.x, point.y));
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    }
  };
}
export function PdfViewRangeSelection(props: RangeSelectionProps) {
  const handlers = useRangePointerHandlers(props);
  const rect = clampPdfNormalizedRect(props.rect);
  return (
    <div
      className="absolute inset-0 touch-none overflow-hidden"
      data-testid="pdf-view-range-selection"
      {...handlers}
    >
      <div
        data-handle="move"
        className="absolute cursor-move border-2 border-selection-blue bg-selection-blue/5"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          boxShadow: '0 0 0 2000px rgba(0,0,0,.22)'
        }}
      >
        {corners.map((corner) => (
          <div
            key={corner}
            data-handle={corner}
            className="absolute size-3 border border-selection-blue bg-white"
            style={{
              left: corner.endsWith('w') ? -6 : undefined,
              right: corner.endsWith('e') ? -6 : undefined,
              top: corner.startsWith('n') ? -6 : undefined,
              bottom: corner.startsWith('s') ? -6 : undefined,
              cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
            }}
          />
        ))}
      </div>
    </div>
  );
}
