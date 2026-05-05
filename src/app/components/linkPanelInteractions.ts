import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { loadLinkPanelSize, normalizeLinkPanelSize, saveLinkPanelSize, type LinkPanelSize } from './linkPanelPreferences';
import type { LinkPanelRecord } from './linkPanelState';
import {
  clampLinkPanelPosition,
  createAnchoredLinkPanelPosition,
  fitLinkPanelSizeToBounds,
  type LinkPanelViewportBounds,
  type LinkPanelPosition
} from './linkPanelViewport';

export type LinkPanelWebviewTag = HTMLElement & {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  insertCSS: (css: string) => Promise<string>;
  src: string;
};

interface DragStartState {
  originX: number;
  originY: number;
  panelId: string;
  startX: number;
  startY: number;
}

interface ResizeStartState {
  height: number;
  startX: number;
  startY: number;
  width: number;
}

const EMBEDDED_SCROLLBAR_CSS = `
  html, body {
    scrollbar-color: color-mix(in srgb, CanvasText 18%, transparent) transparent;
    scrollbar-width: thin;
  }
  ::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
    background-color: color-mix(in srgb, CanvasText 18%, transparent);
  }
`;

function syncLinkPanelState(
  ref: RefObject<LinkPanelWebviewTag>,
  panelId: string,
  onStateChange: (panelId: string, state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>) => void
) {
  const webview = ref.current;
  if (!webview) {
    return;
  }
  onStateChange(panelId, {
    canGoBack: webview.canGoBack(),
    canGoForward: webview.canGoForward(),
    currentUrl: webview.src,
    title: webview.getAttribute('data-page-title')?.trim() || webview.src
  });
}

function resolveResizedSize(start: ResizeStartState, clientX: number, clientY: number) {
  return normalizeLinkPanelSize({
    height: start.height + clientY - start.startY,
    width: start.width + clientX - start.startX
  });
}

export function buildLinkPanelStyle(position: LinkPanelPosition, size: LinkPanelSize) {
  return {
    height: `${size.height}px`,
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${size.width}px`
  };
}

export function useLinkPanelSize() {
  const [size, setSize] = useState<LinkPanelSize>(() => loadLinkPanelSize());

  useEffect(() => {
    saveLinkPanelSize(size);
  }, [size]);

  useEffect(() => {
    const handleResize = () => {
      setSize((current) => normalizeLinkPanelSize(current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { setSize, size };
}

export function useLinkPanelPositions(panelCount: number, size: LinkPanelSize, bounds: LinkPanelViewportBounds) {
  const [positions, setPositions] = useState<Record<string, LinkPanelPosition>>({});

  useEffect(() => {
    setPositions((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(next).forEach(([panelId, position]) => {
        const normalized = clampLinkPanelPosition(position, size, bounds);
        if (normalized.x !== position.x || normalized.y !== position.y) {
          next[panelId] = normalized;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [bounds, panelCount, size]);

  return { positions, setPositions };
}

export function useLinkPanelResize(
  bounds: LinkPanelViewportBounds,
  setSize: (updater: (current: LinkPanelSize) => LinkPanelSize) => void
) {
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) {
        return;
      }
      setSize(() => fitLinkPanelSizeToBounds(resolveResizedSize(resizeStart, event.clientX, event.clientY), bounds));
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
  }, [bounds, setSize]);

  return (event: ReactPointerEvent<HTMLDivElement>, size: LinkPanelSize) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = {
      height: size.height,
      startX: event.clientX,
      startY: event.clientY,
      width: size.width
    };
    document.body.classList.add('link-panel-resizing');
  };
}

export function useLinkPanelDrag(
  bounds: LinkPanelViewportBounds,
  setPositions: (updater: (current: Record<string, LinkPanelPosition>) => Record<string, LinkPanelPosition>) => void,
  size: LinkPanelSize
) {
  const dragStartRef = useRef<DragStartState | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragStart = dragStartRef.current;
      if (!dragStart) {
        return;
      }
      setPositions((current) => ({
        ...current,
        [dragStart.panelId]: clampLinkPanelPosition(
          {
            x: dragStart.originX + event.clientX - dragStart.startX,
            y: dragStart.originY + event.clientY - dragStart.startY
          },
          size,
          bounds
        )
      }));
    };
    const stopDrag = () => {
      dragStartRef.current = null;
      document.body.classList.remove('link-panel-dragging');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };
  }, [bounds, setPositions, size]);

  return (panelId: string, event: ReactPointerEvent<HTMLElement>, position: LinkPanelPosition) => {
    event.preventDefault();
    dragStartRef.current = {
      originX: position.x,
      originY: position.y,
      panelId,
      startX: event.clientX,
      startY: event.clientY
    };
    document.body.classList.add('link-panel-dragging');
  };
}

export function useLinkPanelLifecycle(args: {
  onStateChange: (panelId: string, state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>) => void;
  panelId: string;
  webviewRef: RefObject<LinkPanelWebviewTag>;
}) {
  useEffect(() => {
    const webview = args.webviewRef.current;
    if (!webview) {
      return;
    }

    const handleNavigation = () => syncLinkPanelState(args.webviewRef, args.panelId, args.onStateChange);
    const handleDomReady = () => {
      void webview.insertCSS(EMBEDDED_SCROLLBAR_CSS).catch(() => undefined);
      handleNavigation();
    };
    const handleTitleUpdate = (event: Event) => {
      const nextTitle = (event as Event & { title?: string }).title?.trim();
      if (nextTitle) {
        webview.setAttribute('data-page-title', nextTitle);
      }
      handleNavigation();
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);
    webview.addEventListener('did-stop-loading', handleNavigation);
    webview.addEventListener('page-title-updated', handleTitleUpdate);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-navigate', handleNavigation);
      webview.removeEventListener('did-navigate-in-page', handleNavigation);
      webview.removeEventListener('did-stop-loading', handleNavigation);
      webview.removeEventListener('page-title-updated', handleTitleUpdate);
    };
  }, [args.onStateChange, args.panelId, args.webviewRef]);
}

export function syncMissingLinkPanelPositions(args: {
  bounds: LinkPanelViewportBounds;
  panels: LinkPanelRecord[];
  setPositions: (updater: (current: Record<string, LinkPanelPosition>) => Record<string, LinkPanelPosition>) => void;
  size: LinkPanelSize;
}) {
  args.setPositions((current) => {
    let changed = false;
    const next = { ...current };
    args.panels.forEach((panel, index) => {
      if (!next[panel.id]) {
        next[panel.id] = createAnchoredLinkPanelPosition(index, args.size, args.bounds, panel.anchorPoint);
        changed = true;
      }
    });
    Object.keys(next).forEach((panelId) => {
      if (!args.panels.some((panel) => panel.id === panelId)) {
        delete next[panelId];
        changed = true;
      }
    });
    return changed ? next : current;
  });
}
