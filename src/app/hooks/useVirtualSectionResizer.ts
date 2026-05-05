import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import {
  loadVirtualSectionHeightPreference,
  saveVirtualSectionHeightPreference
} from '../../store/workspaceLayoutPrefs';

const MAX_HEIGHT = 360;
const MIN_HEIGHT = 120;
const STEP = 16;
export const VIRTUAL_SECTION_HEIGHT_DEFAULT = 180;

interface ResizeStartState {
  startHeight: number;
  startY: number;
}

function clampHeight(height: number) {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)));
}

export function useVirtualSectionResizer(initialHeight = VIRTUAL_SECTION_HEIGHT_DEFAULT) {
  const [height, setHeight] = useState(() => clampHeight(loadVirtualSectionHeightPreference(initialHeight)));
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    saveVirtualSectionHeightPreference(height);
  }, [height]);

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }
      const delta = resizeStart.startY - event.clientY;
      setHeight(clampHeight(resizeStart.startHeight + delta));
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
    resizeStartRef.current = { startHeight: height, startY: event.clientY };
    setIsResizing(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHeight((currentHeight) => clampHeight(currentHeight + STEP));
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHeight((currentHeight) => clampHeight(currentHeight - STEP));
    }
  };

  return {
    handleKeyDown,
    handlePointerDown,
    height,
    isResizing
  };
}
