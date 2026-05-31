export const RIGHT_SIDEBAR_WIDTH_MIN = 250;

export function clampRightSidebarWidth(width: number) {
  return Math.max(RIGHT_SIDEBAR_WIDTH_MIN, width);
}
