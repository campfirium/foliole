const COMFORT_SCROLL_ANCHOR_RATIO = 0.38;

export function resolveComfortScrollTop(args: {
  containerHeight: number;
  currentScrollTop: number;
  itemEnd: number;
  itemStart: number;
  maxScrollTop: number;
}) {
  const viewportBottom = args.currentScrollTop + args.containerHeight;
  if (args.itemEnd > args.currentScrollTop && args.itemStart < viewportBottom) {
    return null;
  }
  const targetTop = args.itemStart - args.containerHeight * COMFORT_SCROLL_ANCHOR_RATIO;
  return Math.max(0, Math.min(targetTop, args.maxScrollTop));
}
