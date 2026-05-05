import type { Dispatch, SetStateAction } from 'react';

const HIDE_SCROLL_THRESHOLD = 10;
const SHOW_SCROLL_THRESHOLD = 6;
const TOP_REVEAL_THRESHOLD = 4;

type Direction = 'down' | 'up' | null;

type FloatingBarVisibilityState = {
  direction: Direction;
  frameId: number | null;
  hideUnlocked: boolean;
  lastScrollY: number;
  lastTouchY: number | null;
  touchDirection: Direction;
  touchTravel: number;
  travel: number;
};

function readScrollTop() {
  if (typeof document === 'undefined') {
    return 0;
  }

  return (
    window.scrollY ||
    document.scrollingElement?.scrollTop ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function setVisibilityState(
  nextVisible: boolean,
  reason: string,
  setIsVisible: Dispatch<SetStateAction<boolean>>
) {
  setIsVisible((currentVisible) => {
    if (currentVisible !== nextVisible) {
      console.info('[companion-top-bar]', JSON.stringify({ nextVisible, reason, scrollTop: readScrollTop() }));
    }
    return nextVisible;
  });
}

function resetTouchState(state: FloatingBarVisibilityState) {
  state.lastTouchY = null;
  state.touchDirection = null;
  state.touchTravel = 0;
}

function resetScrollState(state: FloatingBarVisibilityState, scrollTop: number) {
  state.direction = null;
  state.travel = 0;
  state.lastScrollY = scrollTop;
}

function revealBar(state: FloatingBarVisibilityState, setIsVisible: Dispatch<SetStateAction<boolean>>) {
  setVisibilityState(true, 'reveal', setIsVisible);
  state.hideUnlocked = false;
  resetTouchState(state);
  resetScrollState(state, readScrollTop());
}

function accumulateTravel(currentDirection: Direction, nextDirection: Exclude<Direction, null>, travel: number, magnitude: number) {
  return currentDirection === nextDirection ? travel + magnitude : magnitude;
}

function applyScrollVisibility(
  state: FloatingBarVisibilityState,
  nextScrollY: number,
  delta: number,
  setIsVisible: Dispatch<SetStateAction<boolean>>
) {
  const nextDirection: Exclude<Direction, null> = delta > 0 ? 'down' : 'up';
  state.travel = accumulateTravel(state.direction, nextDirection, state.travel, Math.abs(delta));
  state.direction = nextDirection;

  if (!state.hideUnlocked && delta > 0) {
    state.hideUnlocked = true;
  }
  if (nextScrollY <= TOP_REVEAL_THRESHOLD) {
    setVisibilityState(true, 'scroll-top', setIsVisible);
    state.hideUnlocked = false;
    resetScrollState(state, nextScrollY);
    return;
  }
  if (state.hideUnlocked && state.direction === 'down' && state.travel >= HIDE_SCROLL_THRESHOLD) {
    setVisibilityState(false, 'scroll-down', setIsVisible);
    state.travel = 0;
    return;
  }
  if (state.direction === 'up' && state.travel >= SHOW_SCROLL_THRESHOLD) {
    setVisibilityState(true, 'scroll-up', setIsVisible);
    state.travel = 0;
  }
}

function applyTouchVisibility(
  state: FloatingBarVisibilityState,
  delta: number,
  setIsVisible: Dispatch<SetStateAction<boolean>>
) {
  const nextDirection: Exclude<Direction, null> = delta > 0 ? 'down' : 'up';
  state.touchTravel = accumulateTravel(state.touchDirection, nextDirection, state.touchTravel, Math.abs(delta));
  state.touchDirection = nextDirection;

  if (!state.hideUnlocked && delta > 0) {
    state.hideUnlocked = true;
  }
  if (readScrollTop() <= TOP_REVEAL_THRESHOLD) {
    setVisibilityState(true, 'touch-top', setIsVisible);
    state.hideUnlocked = false;
    resetTouchState(state);
    return;
  }
  if (state.hideUnlocked && state.touchDirection === 'down' && state.touchTravel >= HIDE_SCROLL_THRESHOLD) {
    setVisibilityState(false, 'touch-down', setIsVisible);
    state.touchTravel = 0;
    return;
  }
  if (state.touchDirection === 'up' && state.touchTravel >= SHOW_SCROLL_THRESHOLD) {
    setVisibilityState(true, 'touch-up', setIsVisible);
    state.touchTravel = 0;
  }
}

function createState(): FloatingBarVisibilityState {
  return {
    direction: null,
    frameId: null,
    hideUnlocked: false,
    lastScrollY: readScrollTop(),
    lastTouchY: null,
    touchDirection: null,
    touchTravel: 0,
    travel: 0
  };
}

function createHandlers(state: FloatingBarVisibilityState, setIsVisible: Dispatch<SetStateAction<boolean>>) {
  const processScroll = () => {
    state.frameId = null;
    const nextScrollY = readScrollTop();
    const delta = nextScrollY - state.lastScrollY;
    if (Math.abs(delta) < 1) {
      state.lastScrollY = nextScrollY;
      return;
    }
    applyScrollVisibility(state, nextScrollY, delta, setIsVisible);
    state.lastScrollY = nextScrollY;
  };

  const handleScroll = () => {
    if (state.frameId === null) {
      state.frameId = window.requestAnimationFrame(processScroll);
    }
  };

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    state.lastTouchY = touch.clientY;
    state.touchDirection = null;
    state.touchTravel = 0;
  };

  const handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch || state.lastTouchY === null) {
      return;
    }
    const delta = state.lastTouchY - touch.clientY;
    if (Math.abs(delta) < 1) {
      state.lastTouchY = touch.clientY;
      return;
    }
    applyTouchVisibility(state, delta, setIsVisible);
    state.lastTouchY = touch.clientY;
  };

  const handleTouchEnd = () => resetTouchState(state);
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      revealBar(state, setIsVisible);
    }
  };
  const handleFocus = () => revealBar(state, setIsVisible);

  return {
    handleFocus,
    handleScroll,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    handleVisibilityChange
  };
}

function attachListeners(handlers: ReturnType<typeof createHandlers>, frameIdRef: () => number | null) {
  const scrollingElement = document.scrollingElement;
  window.addEventListener('scroll', handlers.handleScroll, { passive: true });
  document.addEventListener('scroll', handlers.handleScroll, { passive: true, capture: true });
  scrollingElement?.addEventListener('scroll', handlers.handleScroll, { passive: true });
  window.addEventListener('touchstart', handlers.handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handlers.handleTouchMove, { passive: true });
  window.addEventListener('touchend', handlers.handleTouchEnd, { passive: true });
  window.addEventListener('touchcancel', handlers.handleTouchEnd, { passive: true });
  window.addEventListener('focus', handlers.handleFocus);
  document.addEventListener('visibilitychange', handlers.handleVisibilityChange);

  return () => {
    const frameId = frameIdRef();
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    window.removeEventListener('scroll', handlers.handleScroll);
    document.removeEventListener('scroll', handlers.handleScroll, true);
    scrollingElement?.removeEventListener('scroll', handlers.handleScroll);
    window.removeEventListener('touchstart', handlers.handleTouchStart);
    window.removeEventListener('touchmove', handlers.handleTouchMove);
    window.removeEventListener('touchend', handlers.handleTouchEnd);
    window.removeEventListener('touchcancel', handlers.handleTouchEnd);
    window.removeEventListener('focus', handlers.handleFocus);
    document.removeEventListener('visibilitychange', handlers.handleVisibilityChange);
  };
}

export function installFloatingBarVisibilityListeners(setIsVisible: Dispatch<SetStateAction<boolean>>) {
  const state = createState();
  const handlers = createHandlers(state, setIsVisible);

  revealBar(state, setIsVisible);
  return attachListeners(handlers, () => state.frameId);
}
