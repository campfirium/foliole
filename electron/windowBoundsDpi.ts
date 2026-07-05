import { screen, type BrowserWindow, type Rectangle } from 'electron';

const PHYSICAL_BOUNDS_RATIO = 1.35;

function roundRect(rect: Rectangle): Rectangle {
  return {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    x: Math.round(rect.x),
    y: Math.round(rect.y)
  };
}

function isLikelyPhysicalRect(rect: Rectangle, converted: Rectangle) {
  const display = screen.getDisplayMatching(converted);
  const { workArea } = display;
  const oversized =
    rect.width > workArea.width * PHYSICAL_BOUNDS_RATIO ||
    rect.height > workArea.height * PHYSICAL_BOUNDS_RATIO;
  const convertedFits =
    converted.width <= workArea.width * PHYSICAL_BOUNDS_RATIO &&
    converted.height <= workArea.height * PHYSICAL_BOUNDS_RATIO;
  return oversized && convertedFits;
}

export function normalizeWindowBoundsToDip(window: BrowserWindow | null, rect: Rectangle): Rectangle {
  if (process.platform !== 'win32' || typeof screen.screenToDipRect !== 'function') {
    return roundRect(rect);
  }
  const convertedForWindow = screen.screenToDipRect(window, rect);
  if (isLikelyPhysicalRect(rect, convertedForWindow)) {
    return roundRect(convertedForWindow);
  }
  const convertedForRect = window ? screen.screenToDipRect(null, rect) : convertedForWindow;
  return roundRect(isLikelyPhysicalRect(rect, convertedForRect) ? convertedForRect : rect);
}
