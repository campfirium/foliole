import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import {
  buildExternalDocumentPreviewFullscreenStyle,
  buildExternalDocumentPreviewWindowedStyle,
  loadExternalDocumentPreviewPanelSize,
  normalizeExternalDocumentPreviewPanelSize,
  saveExternalDocumentPreviewPanelSize,
  type ExternalDocumentPreviewPanelSize
} from './externalDocumentPreviewPanelPreferences';
import { useLinkPanelViewportBounds } from './linkPanelBounds';
import {
  clampLinkPanelPosition,
  createAnchoredLinkPanelPosition,
  fitLinkPanelSizeToBounds,
  type LinkPanelPosition,
  type LinkPanelViewportBounds
} from './linkPanelViewport';

interface DragStartState {
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}

interface ResizeStartState {
  height: number;
  startX: number;
  startY: number;
  width: number;
}


function useExternalDocumentPreviewPanelSize(bounds: LinkPanelViewportBounds) {
  const [size, setSize] = useState<ExternalDocumentPreviewPanelSize>(() => loadExternalDocumentPreviewPanelSize());

  useEffect(() => {
    saveExternalDocumentPreviewPanelSize(size);
  }, [size]);

  useEffect(() => {
    setSize((current) => normalizeExternalDocumentPreviewPanelSize(current));
  }, []);

  return {
    effectiveSize: fitLinkPanelSizeToBounds(size, bounds),
    setSize
  };
}

function useExternalDocumentPreviewPanelPosition(args: {
  bounds: LinkPanelViewportBounds;
  effectiveSize: ExternalDocumentPreviewPanelSize;
  isOpen: boolean;
}) {
  const [position, setPosition] = useState<LinkPanelPosition | null>(null);

  useEffect(() => {
    if (!args.isOpen) {
      setPosition(null);
      return;
    }
    setPosition((current) => current ?? createAnchoredLinkPanelPosition(0, args.effectiveSize, args.bounds));
  }, [args.bounds, args.effectiveSize, args.isOpen]);

  useEffect(() => {
    if (!position) {
      return;
    }
    setPosition((current) => {
      if (!current) {
        return current;
      }
      const next = clampLinkPanelPosition(current, args.effectiveSize, args.bounds);
      if (next.x === current.x && next.y === current.y) {
        return current;
      }
      return next;
    });
  }, [args.bounds, args.effectiveSize, position]);

  return { position, setPosition };
}

function useExternalDocumentPreviewPanelDrag(args: {
  bounds: LinkPanelViewportBounds;
  effectiveSize: ExternalDocumentPreviewPanelSize;
  isFullscreen: boolean;
  position: LinkPanelPosition | null;
  setPosition: (position: LinkPanelPosition) => void;
}) {
  const dragStartRef = useRef<DragStartState | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragStart = dragStartRef.current;
      if (dragStart && !args.isFullscreen) {
        args.setPosition(
          clampLinkPanelPosition(
            {
              x: dragStart.originX + event.clientX - dragStart.startX,
              y: dragStart.originY + event.clientY - dragStart.startY
            },
            args.effectiveSize,
            args.bounds
          )
        );
      }
    };

    const stopInteractions = () => {
      dragStartRef.current = null;
      document.body.classList.remove('link-panel-dragging');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopInteractions);
    window.addEventListener('pointercancel', stopInteractions);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopInteractions);
      window.removeEventListener('pointercancel', stopInteractions);
    };
  }, [args]);

  return {
    startDrag: (event: ReactPointerEvent<HTMLElement>) => {
      if (args.isFullscreen) {
        return;
      }
      const currentPosition = args.position ?? createAnchoredLinkPanelPosition(0, args.effectiveSize, args.bounds);
      event.preventDefault();
      dragStartRef.current = {
        originX: currentPosition.x,
        originY: currentPosition.y,
        startX: event.clientX,
        startY: event.clientY
      };
      document.body.classList.add('link-panel-dragging');
    }
  };
}

function useExternalDocumentPreviewPanelResize(args: {
  bounds: LinkPanelViewportBounds;
  effectiveSize: ExternalDocumentPreviewPanelSize;
  isFullscreen: boolean;
  setSize: (size: ExternalDocumentPreviewPanelSize) => void;
}) {
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart || args.isFullscreen) {
        return;
      }
      args.setSize(
        fitLinkPanelSizeToBounds(
          normalizeExternalDocumentPreviewPanelSize({
            height: resizeStart.height + event.clientY - resizeStart.startY,
            width: resizeStart.width + event.clientX - resizeStart.startX
          }),
          args.bounds
        )
      );
    };
    const stopResize = () => {
      resizeStartRef.current = null;
      document.body.classList.remove('link-panel-resizing');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [args]);

  return (event: ReactPointerEvent<HTMLDivElement>) => {
    if (args.isFullscreen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = {
      height: args.effectiveSize.height,
      startX: event.clientX,
      startY: event.clientY,
      width: args.effectiveSize.width
    };
    document.body.classList.add('link-panel-resizing');
  };
}

export function useExternalDocumentPreviewPanelFrame(rootRef: RefObject<HTMLDivElement | null>, isOpen: boolean) {
  const bounds = useLinkPanelViewportBounds(rootRef);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { effectiveSize, setSize } = useExternalDocumentPreviewPanelSize(bounds);
  const { position, setPosition } = useExternalDocumentPreviewPanelPosition({ bounds, effectiveSize, isOpen });
  const drag = useExternalDocumentPreviewPanelDrag({
    bounds,
    effectiveSize,
    isFullscreen,
    position,
    setPosition
  });
  const onResizeStart = useExternalDocumentPreviewPanelResize({ bounds, effectiveSize, isFullscreen, setSize });

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
    }
  }, [isOpen]);

  return {
    ...drag,
    isFullscreen,
    onResizeStart,
    onToggleFullscreen: () => setIsFullscreen((current) => !current),
    panelStyle: isFullscreen
      ? buildExternalDocumentPreviewFullscreenStyle(bounds)
      : buildExternalDocumentPreviewWindowedStyle(
          position ?? createAnchoredLinkPanelPosition(0, effectiveSize, bounds),
          effectiveSize
        )
  };
}
