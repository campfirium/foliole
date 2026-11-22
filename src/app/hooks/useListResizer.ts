import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

const MOBILE_BREAKPOINT = 1080;
const SPLITTER_KEYBOARD_STEP = 16;

interface ResizeStartState {
  startWidth: number;
  startX: number;
}

interface UseListResizerResult {
  isResizingList: boolean;
  handleSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function handleSplitterArrowResize(
  event: KeyboardEvent<HTMLDivElement>,
  listWidth: number,
  setListWidth: (width: number) => void
) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setListWidth(listWidth - SPLITTER_KEYBOARD_STEP);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    setListWidth(listWidth + SPLITTER_KEYBOARD_STEP);
  }
}

export function useListResizer(
  listWidth: number,
  setListWidth: (width: number) => void
): UseListResizerResult {
  const [isResizingList, setIsResizingList] = useState(false);
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    if (!isResizingList) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }
      const delta = event.clientX - resizeStart.startX;
      setListWidth(Math.round(resizeStart.startWidth + delta));
    };

    const stopResize = () => {
      resizeStartRef.current = null;
      setIsResizingList(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.classList.add('workspace-resizing');

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.classList.remove('workspace-resizing');
    };
  }, [isResizingList, setListWidth]);

  const handleSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      return;
    }
    event.preventDefault();
    resizeStartRef.current = { startWidth: listWidth, startX: event.clientX };
    setIsResizingList(true);
  };

  const handleSplitterKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    handleSplitterArrowResize(event, listWidth, setListWidth);
  };

  return { handleSplitterKeyDown, handleSplitterPointerDown, isResizingList };
}
