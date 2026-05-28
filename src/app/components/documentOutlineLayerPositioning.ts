import { useLayoutEffect, useRef } from 'react';

import type { OutlineDisplayItem } from './DocumentOutlineLayerModel';
import { resolvePanelScrollTop } from './DocumentOutlineLayerModel';

const ACTIVE_SCROLL_MARGIN_PX = 24;

export function useOutlinePanelPositioning(args: {
  activeIndex: number;
  isOpen: boolean;
  items: OutlineDisplayItem[];
}) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!args.isOpen || !panelRef.current || !activeItemRef.current) {
      return;
    }

    const activeTop = activeItemRef.current.offsetTop;
    const activeBottom = activeTop + activeItemRef.current.offsetHeight;
    const panelHeight = panelRef.current.offsetHeight;
    panelRef.current.scrollTop = resolvePanelScrollTop(
      activeTop,
      activeBottom,
      panelRef.current.scrollTop,
      panelHeight,
      ACTIVE_SCROLL_MARGIN_PX
    );
  }, [args.activeIndex, args.isOpen, args.items]);

  return {
    setActiveItemRef: (node: HTMLButtonElement | null) => {
      activeItemRef.current = node;
    },
    setPanelRef: (node: HTMLDivElement | null) => {
      panelRef.current = node;
    }
  };
}
