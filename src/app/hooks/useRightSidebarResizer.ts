import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { clampRightSidebarWidth } from '../../store/workspaceLayoutConstraints';

const DESKTOP_BREAKPOINT = 1280;
const SPLITTER_KEYBOARD_STEP = 16;

interface ResizeStartState {
  startWidth: number;
  startX: number;
}

interface UseRightSidebarResizerResult {
  isResizingRightSidebar: boolean;
  handleRightSidebarSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleRightSidebarSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function handleRightSidebarArrowResize(
  event: KeyboardEvent<HTMLDivElement>,
  rightSidebarWidth: number,
  setRightSidebarWidth: (width: number) => void
) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setRightSidebarWidth(clampRightSidebarWidth(rightSidebarWidth + SPLITTER_KEYBOARD_STEP));
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    setRightSidebarWidth(clampRightSidebarWidth(rightSidebarWidth - SPLITTER_KEYBOARD_STEP));
  }
}

export function useRightSidebarResizer(
  rightSidebarWidth: number,
  setRightSidebarWidth: (width: number) => void
): UseRightSidebarResizerResult {
  const [isResizingRightSidebar, setIsResizingRightSidebar] = useState(false);
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    if (!isResizingRightSidebar) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }
      const delta = resizeStart.startX - event.clientX;
      setRightSidebarWidth(clampRightSidebarWidth(Math.round(resizeStart.startWidth + delta)));
    };

    const stopResize = () => {
      resizeStartRef.current = null;
      setIsResizingRightSidebar(false);
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
  }, [isResizingRightSidebar, setRightSidebarWidth]);

  const handleRightSidebarSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
      return;
    }
    event.preventDefault();
    resizeStartRef.current = { startWidth: rightSidebarWidth, startX: event.clientX };
    setIsResizingRightSidebar(true);
  };

  const handleRightSidebarSplitterKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    handleRightSidebarArrowResize(event, rightSidebarWidth, setRightSidebarWidth);
  };

  return {
    handleRightSidebarSplitterKeyDown,
    handleRightSidebarSplitterPointerDown,
    isResizingRightSidebar
  };
}
