import { useEffect, useRef, useState, type MutableRefObject } from 'react';

const TOOLBAR_SHOW_SCROLL_DELTA = 16;
const TOOLBAR_HIDE_SCROLL_DELTA = 24;
const TOOLBAR_TOP_VISIBILITY_OFFSET = 12;

function resetScrollTracking(scrollDirectionRef: MutableRefObject<'down' | 'up' | null>, scrollDistanceRef: MutableRefObject<number>) {
  scrollDirectionRef.current = null;
  scrollDistanceRef.current = 0;
}

function accumulateScrollDistance(delta: number, scrollDirectionRef: MutableRefObject<'down' | 'up' | null>, scrollDistanceRef: MutableRefObject<number>) {
  const direction = delta > 0 ? 'down' : 'up';
  if (scrollDirectionRef.current !== direction) {
    scrollDirectionRef.current = direction;
    scrollDistanceRef.current = 0;
  }
  scrollDistanceRef.current += Math.abs(delta);
  return direction;
}

function shouldForceToolbarVisible(currentScrollTop: number, hasPersistentSearch: boolean, isSearchFocused: boolean) {
  return currentScrollTop <= TOOLBAR_TOP_VISIBILITY_OFFSET || hasPersistentSearch || isSearchFocused;
}

function resolveToolbarVisibilityOnScroll(args: {
  currentScrollTop: number;
  hasPersistentSearch: boolean;
  isSearchFocused: boolean;
  lastScrollTopRef: MutableRefObject<number>;
  scrollDirectionRef: MutableRefObject<'down' | 'up' | null>;
  scrollDistanceRef: MutableRefObject<number>;
}) {
  const delta = args.currentScrollTop - args.lastScrollTopRef.current;
  args.lastScrollTopRef.current = args.currentScrollTop;

  if (shouldForceToolbarVisible(args.currentScrollTop, args.hasPersistentSearch, args.isSearchFocused)) {
    resetScrollTracking(args.scrollDirectionRef, args.scrollDistanceRef);
    return true;
  }
  if (Math.abs(delta) < 2) {
    return null;
  }

  const direction = accumulateScrollDistance(delta, args.scrollDirectionRef, args.scrollDistanceRef);
  if (direction === 'down' && args.scrollDistanceRef.current >= TOOLBAR_HIDE_SCROLL_DELTA) {
    args.scrollDistanceRef.current = 0;
    return false;
  }
  if (direction === 'up' && args.scrollDistanceRef.current >= TOOLBAR_SHOW_SCROLL_DELTA) {
    args.scrollDistanceRef.current = 0;
    return true;
  }
  return null;
}

export function usePdfToolbarVisibility(
  searchQuery: string,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  onScrollBase: () => void
) {
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const hasObservedInitialScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<'down' | 'up' | null>(null);
  const scrollDistanceRef = useRef(0);
  const hasPersistentSearch = searchQuery.trim().length > 0;

  useEffect(() => {
    hasObservedInitialScrollRef.current = false;
    lastScrollTopRef.current = 0;
    resetScrollTracking(scrollDirectionRef, scrollDistanceRef);
    setIsToolbarVisible(true);
  }, [scrollContainerRef]);

  useEffect(() => {
    if (hasPersistentSearch || isSearchFocused) setIsToolbarVisible(true);
  }, [hasPersistentSearch, isSearchFocused]);

  const handleToolbarScroll = () => {
    onScrollBase();

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const currentScrollTop = container.scrollTop;
    if (!hasObservedInitialScrollRef.current) {
      hasObservedInitialScrollRef.current = true;
      lastScrollTopRef.current = currentScrollTop;
      resetScrollTracking(scrollDirectionRef, scrollDistanceRef);
      setIsToolbarVisible(true);
      return;
    }

    const nextVisibility = resolveToolbarVisibilityOnScroll({
      currentScrollTop,
      hasPersistentSearch,
      isSearchFocused,
      lastScrollTopRef,
      scrollDirectionRef,
      scrollDistanceRef
    });
    if (nextVisibility === null) {
      return;
    }
    setIsToolbarVisible(nextVisibility);
  };

  return {
    handleSearchFocusChange: (focused: boolean) => {
      setIsSearchFocused(focused);
      if (focused) {
        setIsToolbarVisible(true);
      }
    },
    handleToolbarScroll,
    isToolbarVisible
  };
}
