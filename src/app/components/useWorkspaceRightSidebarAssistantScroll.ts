import { useLayoutEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_THRESHOLD = 48;

export function useWorkspaceRightSidebarAssistantScroll(contentKey: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
    setShowScrollToLatest(false);
  }, [contentKey]);

  return {
    onScroll: () => {
      const element = scrollRef.current;
      if (!element) return;
      const nearBottom = isAssistantScrollNearBottom(element);
      nearBottomRef.current = nearBottom;
      setShowScrollToLatest(!nearBottom);
    },
    scrollRef,
    scrollToLatest: () => {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollTo({ behavior: 'smooth', top: element.scrollHeight });
      nearBottomRef.current = true;
      setShowScrollToLatest(false);
    },
    showScrollToLatest
  };
}

export function isAssistantScrollNearBottom(element: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_THRESHOLD;
}
