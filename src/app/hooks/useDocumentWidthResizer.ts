import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';

export type ResizeSide = 'left' | 'right';

interface ResizeStartState {
  side: ResizeSide;
  startWidth: number;
  startX: number;
}

interface UseDocumentWidthResizerResult {
  isResizingDocument: boolean;
  activeSide: ResizeSide | null;
  startResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
}

function getWidthDelta(side: ResizeSide, startX: number, currentX: number) {
  if (side === 'left') {
    return startX - currentX;
  }
  return currentX - startX;
}

export function useDocumentWidthResizer(
  documentMaxWidth: number,
  setDocumentMaxWidth: (width: number) => void
): UseDocumentWidthResizerResult {
  const [activeSide, setActiveSide] = useState<ResizeSide | null>(null);
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    if (!activeSide) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }
      const delta = getWidthDelta(resizeStart.side, resizeStart.startX, event.clientX);
      setDocumentMaxWidth(resizeStart.startWidth + delta);
    };

    const onMouseMove = (event: MouseEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }
      const delta = getWidthDelta(resizeStart.side, resizeStart.startX, event.clientX);
      setDocumentMaxWidth(resizeStart.startWidth + delta);
    };

    const stopResize = () => {
      resizeStartRef.current = null;
      setActiveSide(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    window.addEventListener('mouseup', stopResize);
    document.body.classList.add('workspace-resizing');

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      window.removeEventListener('mouseup', stopResize);
      document.body.classList.remove('workspace-resizing');
    };
  }, [activeSide, setDocumentMaxWidth]);

  const startResize = (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    resizeStartRef.current = {
      side,
      startWidth: documentMaxWidth,
      startX: event.clientX
    };
    setActiveSide(side);
  };

  return {
    activeSide,
    isResizingDocument: Boolean(activeSide),
    startResize
  };
}
