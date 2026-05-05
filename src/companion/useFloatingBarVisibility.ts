import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type TouchEvent as ReactTouchEvent,
  type UIEvent as ReactUIEvent
} from 'react';

const HIDE_SCROLL_THRESHOLD = 12;
const SHOW_SCROLL_THRESHOLD = 8;

type Direction = 'down' | 'up' | null;

type ScrollTrackerState = {
  direction: Direction;
  hideUnlocked: boolean;
  lastScrollTop: number;
  lastTouchY: number | null;
  scrollTravel: number;
  touchDirection: Direction;
  touchTravel: number;
};

const INITIAL_TRACKER_STATE: ScrollTrackerState = {
  direction: null,
  hideUnlocked: false,
  lastScrollTop: 0,
  lastTouchY: null,
  scrollTravel: 0,
  touchDirection: null,
  touchTravel: 0
};

function resetTracker(lastScrollTop = 0): ScrollTrackerState {
  return {
    ...INITIAL_TRACKER_STATE,
    lastScrollTop
  };
}

function updateDirectionTravel(currentDirection: Direction, nextDirection: Exclude<Direction, null>, currentTravel: number, magnitude: number) {
  return {
    direction: nextDirection,
    travel: currentDirection === nextDirection ? currentTravel + magnitude : magnitude
  };
}

function handleScrollTravel(nextScrollTop: number, trackerRef: MutableRefObject<ScrollTrackerState>, setIsVisible: (visible: boolean) => void) {
  const tracker = trackerRef.current;
  const delta = nextScrollTop - tracker.lastScrollTop;
  const magnitude = Math.abs(delta);

  if (magnitude < 1) {
    tracker.lastScrollTop = nextScrollTop;
    return;
  }

  const nextDirection: Direction = delta > 0 ? 'down' : 'up';
  const nextTravel = updateDirectionTravel(tracker.direction, nextDirection, tracker.scrollTravel, magnitude);
  tracker.direction = nextTravel.direction;
  tracker.scrollTravel = nextTravel.travel;
  tracker.hideUnlocked ||= delta > 0;

  if (nextScrollTop <= 4) {
    setIsVisible(true);
    trackerRef.current = resetTracker(nextScrollTop);
    return;
  }

  if (tracker.hideUnlocked && tracker.direction === 'down' && tracker.scrollTravel >= HIDE_SCROLL_THRESHOLD) {
    setIsVisible(false);
    tracker.scrollTravel = 0;
  } else if (tracker.direction === 'up' && tracker.scrollTravel >= SHOW_SCROLL_THRESHOLD) {
    setIsVisible(true);
    tracker.scrollTravel = 0;
  }

  tracker.lastScrollTop = nextScrollTop;
}

function handleTouchTravel(event: ReactTouchEvent<HTMLElement>, trackerRef: MutableRefObject<ScrollTrackerState>, setIsVisible: (visible: boolean) => void) {
  const touch = event.touches[0];
  const tracker = trackerRef.current;
  if (!touch || tracker.lastTouchY === null) {
    return;
  }

  const delta = tracker.lastTouchY - touch.clientY;
  const magnitude = Math.abs(delta);
  if (magnitude < 1) {
    tracker.lastTouchY = touch.clientY;
    return;
  }

  const nextDirection: Direction = delta > 0 ? 'down' : 'up';
  const nextTravel = updateDirectionTravel(tracker.touchDirection, nextDirection, tracker.touchTravel, magnitude);
  tracker.touchDirection = nextTravel.direction;
  tracker.touchTravel = nextTravel.travel;
  tracker.hideUnlocked ||= delta > 0;

  if (tracker.touchDirection === 'down' && tracker.hideUnlocked && tracker.touchTravel >= HIDE_SCROLL_THRESHOLD) {
    setIsVisible(false);
    tracker.touchTravel = 0;
  } else if (tracker.touchDirection === 'up' && tracker.touchTravel >= SHOW_SCROLL_THRESHOLD) {
    setIsVisible(true);
    tracker.touchTravel = 0;
  }

  tracker.lastTouchY = touch.clientY;
}

export function useFloatingBarVisibility(resetKey: string | null) {
  const [isVisible, setIsVisible] = useState(true);
  const trackerRef = useRef<ScrollTrackerState>(INITIAL_TRACKER_STATE);

  useEffect(() => {
    setIsVisible(true);
    trackerRef.current = INITIAL_TRACKER_STATE;
  }, [resetKey]);

  const revealBar = () => {
    setIsVisible(true);
    trackerRef.current = INITIAL_TRACKER_STATE;
  };

  const handleContainerScroll = (event: ReactUIEvent<HTMLElement>) => {
    handleScrollTravel(event.currentTarget.scrollTop, trackerRef, setIsVisible);
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    trackerRef.current.lastTouchY = touch.clientY;
    trackerRef.current.touchDirection = null;
    trackerRef.current.touchTravel = 0;
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    handleTouchTravel(event, trackerRef, setIsVisible);
  };

  const handleTouchEnd = () => {
    trackerRef.current.lastTouchY = null;
    trackerRef.current.touchDirection = null;
    trackerRef.current.touchTravel = 0;
  };

  return {
    handleContainerScroll,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    isVisible,
    revealBar
  };
}
