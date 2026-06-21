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
  return resolveRightPanelAvailableWidth({
    controlsWidth: WINDOW_TITLEBAR_CONTROLS_WIDTH,
    rightSidebarWidth
  });
}

export function resolveRightPanelAvailableWidth(args: {
  controlsWidth: number;
  rightSidebarWidth: number;
}) {
  const controlsGap = args.controlsWidth > 0 ? WINDOW_TITLEBAR_RIGHT_ZONE_CONTROL_GAP : 0;
  return Math.max(
    0,
    args.rightSidebarWidth -
      WINDOW_TITLEBAR_DIVIDER_WIDTH -
      WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH -
      args.controlsWidth -
      controlsGap
  );
}

export function resolveRightSidebarWidthForPanelRow(panelCount: number) {
  return (
    WINDOW_TITLEBAR_DIVIDER_WIDTH +
    WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH +
    WINDOW_TITLEBAR_CONTROLS_WIDTH +
    WINDOW_TITLEBAR_RIGHT_ZONE_CONTROL_GAP +
    TITLEBAR_ACTION_ROW_LEFT_PADDING +
    panelCount * TITLEBAR_ACTION_WIDTH
  );
}

export function resolveVisibleRightPanelCount(args: {
  availableWidth: number;
  panelCount: number;
}) {
  const { availableWidth, panelCount } = args;
  const panelRowWidth = TITLEBAR_ACTION_ROW_LEFT_PADDING + panelCount * TITLEBAR_ACTION_WIDTH;
  if (availableWidth >= panelRowWidth) {
    return panelCount;
  }

  const visibleWithOverflowWidth = availableWidth - TITLEBAR_ACTION_ROW_LEFT_PADDING - TITLEBAR_ACTION_WIDTH;
  if (visibleWithOverflowWidth < TITLEBAR_ACTION_WIDTH) {
    return 0;
  }
  const count = Math.floor(visibleWithOverflowWidth / TITLEBAR_ACTION_WIDTH);
  return Math.max(0, Math.min(panelCount - 1, count));
}
