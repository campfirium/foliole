import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import {
  loadDualListWidthPreference,
  saveDualListWidthPreference
} from '../../store/workspaceLayoutPrefs';

const MAX_WIDTH = 420;
const MIN_WIDTH = 100;
const STEP = 16;
export const DUAL_LIST_WIDTH_DEFAULT = 200;

interface ResizeStartState {
  startWidth: number;
  startX: number;
}

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

export function useDualListResizer(initialWidth = DUAL_LIST_WIDTH_DEFAULT) {
  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(() => clampWidth(loadDualListWidthPreference(initialWidth)));
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    saveDualListWidthPreference(width);
  }, [width]);

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }

      const delta = event.clientX - resizeStart.startX;
      setWidth(clampWidth(resizeStart.startWidth + delta));
    };

    const stopResize = () => {
      resizeStartRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.classList.add('workspace-resizing');

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.classList.remove('workspace-resizing');
    };
  }, [isResizing]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStartRef.current = { startWidth: width, startX: event.clientX };
    setIsResizing(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setWidth((currentWidth) => clampWidth(currentWidth - STEP));
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth((currentWidth) => clampWidth(currentWidth + STEP));
    }
  };

  return {
    handleKeyDown,
    handlePointerDown,
    isResizing,
    width
  };
}
