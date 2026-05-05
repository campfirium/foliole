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

function shouldForceToolbarVisible(currentScrollTop: number, hasPersistentSearch: boolean, isSearchFocused: boolean, isToolbarActive: boolean) {
  return currentScrollTop <= TOOLBAR_TOP_VISIBILITY_OFFSET || hasPersistentSearch || isSearchFocused || isToolbarActive;
}

function resolveToolbarVisibilityOnScroll(args: {
  currentScrollTop: number;
  hasPersistentSearch: boolean;
  isSearchFocused: boolean;
  isToolbarActive: boolean;
  lastScrollTopRef: MutableRefObject<number>;
  scrollDirectionRef: MutableRefObject<'down' | 'up' | null>;
  scrollDistanceRef: MutableRefObject<number>;
}) {
  const delta = args.currentScrollTop - args.lastScrollTopRef.current;
  args.lastScrollTopRef.current = args.currentScrollTop;

  if (shouldForceToolbarVisible(args.currentScrollTop, args.hasPersistentSearch, args.isSearchFocused, args.isToolbarActive)) {
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

function syncToolbarWithObservedScroll(args: {
  currentScrollTop: number;
  hasObservedInitialScrollRef: MutableRefObject<boolean>;
  lastScrollTopRef: MutableRefObject<number>;
  scrollDirectionRef: MutableRefObject<'down' | 'up' | null>;
  scrollDistanceRef: MutableRefObject<number>;
  setIsToolbarVisible: (value: boolean) => void;
  suppressScrollTrackingRef: MutableRefObject<boolean>;
  hasPersistentSearch: boolean;
  isSearchFocused: boolean;
  isToolbarActive: boolean;
}) {
  if (!args.hasObservedInitialScrollRef.current) {
    args.hasObservedInitialScrollRef.current = true;
    args.lastScrollTopRef.current = args.currentScrollTop;
    resetScrollTracking(args.scrollDirectionRef, args.scrollDistanceRef);
    args.setIsToolbarVisible(true);
    return;
  }
  if (args.suppressScrollTrackingRef.current) {
    args.suppressScrollTrackingRef.current = false;
    args.lastScrollTopRef.current = args.currentScrollTop;
    resetScrollTracking(args.scrollDirectionRef, args.scrollDistanceRef);
    args.setIsToolbarVisible(true);
    return;
  }

  const nextVisibility = resolveToolbarVisibilityOnScroll(args);
  if (nextVisibility !== null) {
    args.setIsToolbarVisible(nextVisibility);
  }
}

function handleToolbarInteraction(
  scrollDirectionRef: MutableRefObject<'down' | 'up' | null>,
  scrollDistanceRef: MutableRefObject<number>,
  setIsToolbarVisible: (value: boolean) => void,
  suppressScrollTrackingRef: MutableRefObject<boolean>
) {
  suppressScrollTrackingRef.current = true;
  resetScrollTracking(scrollDirectionRef, scrollDistanceRef);
  setIsToolbarVisible(true);
}

function handleSearchFocusChange(setIsSearchFocused: (value: boolean) => void, setIsToolbarVisible: (value: boolean) => void, focused: boolean) {
  setIsSearchFocused(focused);
  if (focused) {
    setIsToolbarVisible(true);
  }
}

function useToolbarVisibilityReset(
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  lastScrollTopRef: MutableRefObject<number>,
  scrollDirectionRef: MutableRefObject<'down' | 'up' | null>,
  scrollDistanceRef: MutableRefObject<number>,
  hasObservedInitialScrollRef: MutableRefObject<boolean>,
  setIsToolbarVisible: (value: boolean) => void
) {
  useEffect(() => {
    hasObservedInitialScrollRef.current = false;
    lastScrollTopRef.current = 0;
    resetScrollTracking(scrollDirectionRef, scrollDistanceRef);
    setIsToolbarVisible(true);
  }, [hasObservedInitialScrollRef, lastScrollTopRef, scrollContainerRef, scrollDirectionRef, scrollDistanceRef, setIsToolbarVisible]);
}

function useToolbarPersistentVisibility(forceVisible: boolean, isSearchFocused: boolean, setIsToolbarVisible: (value: boolean) => void) {
  useEffect(() => {
    if (forceVisible || isSearchFocused) {
      setIsToolbarVisible(true);
    }
  }, [forceVisible, isSearchFocused, setIsToolbarVisible]);
}

export function usePdfToolbarVisibility(searchQuery: string, scrollContainerRef: MutableRefObject<HTMLDivElement | null>, onScrollBase: () => void) {
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isToolbarActive, setIsToolbarActive] = useState(false);
  const hasObservedInitialScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const suppressScrollTrackingRef = useRef(false);
  const scrollDirectionRef = useRef<'down' | 'up' | null>(null);
  const scrollDistanceRef = useRef(0);
  const hasPersistentSearch = searchQuery.trim().length > 0;

  useToolbarVisibilityReset(scrollContainerRef, lastScrollTopRef, scrollDirectionRef, scrollDistanceRef, hasObservedInitialScrollRef, setIsToolbarVisible);
  useToolbarPersistentVisibility(hasPersistentSearch || isToolbarActive, isSearchFocused, setIsToolbarVisible);

  return {
    handleSearchFocusChange: (focused: boolean) => handleSearchFocusChange(setIsSearchFocused, setIsToolbarVisible, focused),
    handleToolbarActiveChange: (active: boolean) => {
      setIsToolbarActive(active);
      if (active) {
        setIsToolbarVisible(true);
      }
    },
    handleToolbarInteraction: () => handleToolbarInteraction(scrollDirectionRef, scrollDistanceRef, setIsToolbarVisible, suppressScrollTrackingRef),
    handleToolbarScroll: () => {
      onScrollBase();
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }
      syncToolbarWithObservedScroll({
        currentScrollTop: container.scrollTop,
        hasObservedInitialScrollRef,
        hasPersistentSearch,
        isSearchFocused,
        isToolbarActive,
        lastScrollTopRef,
        scrollDirectionRef,
        scrollDistanceRef,
        setIsToolbarVisible,
        suppressScrollTrackingRef
      });
    },
    isToolbarVisible
  };
}
