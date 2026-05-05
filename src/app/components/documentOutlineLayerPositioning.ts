import { useLayoutEffect, useRef, useState } from 'react';

import type { OutlineDisplayItem } from './DocumentOutlineLayerModel';
import { resolvePanelScrollTop, resolvePanelSlack } from './DocumentOutlineLayerModel';

export function useOutlinePanelPositioning(args: {
  activeIndex: number;
  anchorY: number;
  isOpen: boolean;
  items: OutlineDisplayItem[];
}) {
  const [panelPaddingTop, setPanelPaddingTop] = useState(0);
  const [panelPaddingBottom, setPanelPaddingBottom] = useState(0);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!args.isOpen || !panelRef.current || !activeItemRef.current) {
      return;
    }

    const activeTop = activeItemRef.current.offsetTop;
    const panelHeight = panelRef.current.offsetHeight;
    const scrollHeight = panelRef.current.scrollHeight;
    const panelSlack = resolvePanelSlack(panelHeight);
    setPanelPaddingTop(panelSlack);
    setPanelPaddingBottom(panelSlack);
    panelRef.current.scrollTop = resolvePanelScrollTop(args.anchorY, activeTop, panelHeight, scrollHeight);
  }, [args.activeIndex, args.anchorY, args.isOpen, args.items]);

  return {
    panelPaddingTop,
    panelPaddingBottom,
    setActiveItemRef: (node: HTMLButtonElement | null) => {
      activeItemRef.current = node;
    },
    setPanelRef: (node: HTMLDivElement | null) => {
      panelRef.current = node;
    }
  };
}
