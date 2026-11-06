import { useLayoutEffect, useMemo, useRef, type ReactNode, type UIEvent } from 'react';

import type { WorkspaceRightSidebarProps } from './WorkspaceRightSidebar';

interface PanelPosition {
  top: number;
  outlinePosition: number;
}

export function useWorkspaceRightSidebarScroll(props: WorkspaceRightSidebarProps) {
  const positions = useMemo(() => new Map<string, PanelPosition>(), [
    props.activeNodeId, Boolean(props.outlineDocument), props.outlineDocument?.contextId
  ]);
  const outlinePosition = props.outlineDocument?.activePosition ?? props.outlineActivePosition ?? 0;
  return {
    savePanelScroll(event: UIEvent<HTMLDivElement>) {
      positions.set(props.activePanelId, { top: event.currentTarget.scrollTop, outlinePosition });
    },
    restorePanelScroll(element: HTMLDivElement) {
      const saved = positions.get(props.activePanelId);
      if (saved && (props.activePanelId !== 'outline' || saved.outlinePosition === outlinePosition)) {
        element.scrollTop = saved.top;
      }
    }
  };
}

// Mount inside Suspense so lazy panel loading cannot consume a saved position on an empty surface.
export function WorkspaceRightSidebarScrollContent(props: {
  children: ReactNode;
  onReady?: (() => void) | undefined;
}) {
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!restored.current) {
      props.onReady?.();
      restored.current = true;
    }
  });
  return props.children;
}
