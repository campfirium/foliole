import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
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

function updateDocumentWidthFromX(
  currentX: number,
  resizeStartRef: MutableRefObject<ResizeStartState | null>,
  setDocumentMaxWidth: (width: number) => void
) {
  const resizeStart = resizeStartRef.current;
  if (!resizeStart) {
    return;
  }
  const delta = getWidthDelta(resizeStart.side, resizeStart.startX, currentX);
  setDocumentMaxWidth(resizeStart.startWidth + delta);
}

function attachDocumentResizeListeners(
  resizeStartRef: MutableRefObject<ResizeStartState | null>,
  setDocumentMaxWidth: (width: number) => void,
  onStopResize: () => void
) {
  const onPointerMove = (event: PointerEvent) => {
    updateDocumentWidthFromX(event.clientX, resizeStartRef, setDocumentMaxWidth);
  };

  const onMouseMove = (event: MouseEvent) => {
    updateDocumentWidthFromX(event.clientX, resizeStartRef, setDocumentMaxWidth);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('pointerup', onStopResize);
  window.addEventListener('pointercancel', onStopResize);
  window.addEventListener('mouseup', onStopResize);
  document.body.classList.add('workspace-resizing');

  return () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('pointerup', onStopResize);
    window.removeEventListener('pointercancel', onStopResize);
    window.removeEventListener('mouseup', onStopResize);
    document.body.classList.remove('workspace-resizing');
  };
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

    const stopResize = () => {
      resizeStartRef.current = null;
      setActiveSide(null);
    };

    return attachDocumentResizeListeners(resizeStartRef, setDocumentMaxWidth, stopResize);
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
