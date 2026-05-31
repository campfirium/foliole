import {
  WINDOW_TITLEBAR_CONTROLS_WIDTH,
  WINDOW_TITLEBAR_DIVIDER_WIDTH,
  WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH,
  WINDOW_TITLEBAR_RIGHT_PANEL_GAP,
  WINDOW_TITLEBAR_RIGHT_ZONE_CONTROL_GAP
} from './windowTitleBarLayout';

const TITLEBAR_ACTION_WIDTH = WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH;
const TITLEBAR_ACTION_ROW_LEFT_PADDING = WINDOW_TITLEBAR_RIGHT_PANEL_GAP;

export function resolveRightPanelAvailableWidthFromSidebarWidth(rightSidebarWidth: number) {
  return Math.max(
    0,
    rightSidebarWidth -
      WINDOW_TITLEBAR_DIVIDER_WIDTH -
      WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH -
      WINDOW_TITLEBAR_CONTROLS_WIDTH -
      WINDOW_TITLEBAR_RIGHT_ZONE_CONTROL_GAP
  );
}

export function resolveVisibleRightPanelCount(args: {
  availableWidth: number;
  maxCount: number;
}) {
  const { availableWidth, maxCount } = args;
  const remainingWidth = availableWidth - TITLEBAR_ACTION_ROW_LEFT_PADDING - TITLEBAR_ACTION_WIDTH;
  if (remainingWidth < TITLEBAR_ACTION_WIDTH) {
    return 0;
  }
  const count = Math.floor(remainingWidth / TITLEBAR_ACTION_WIDTH);
  return Math.max(0, Math.min(maxCount, count));
}
