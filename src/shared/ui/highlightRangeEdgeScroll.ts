const EDGE_ZONE = 38;
const SCROLL_STEP = 12;

export function createHighlightRangeEdgeScroll(surface: HTMLElement, updateRange: (x: number, y: number) => void) {
  let frame = 0;
  let point: { x: number; y: number } | null = null;
  function scroll() {
    frame = 0;
    if (!point) return;
    const { top, bottom } = surface.getBoundingClientRect();
    if (bottom - top < EDGE_ZONE * 2) return;
    const direction = point.y > bottom - EDGE_ZONE ? 1 : point.y < top + EDGE_ZONE ? -1 : 0;
    if (!direction) return;
    const previous = surface.scrollTop;
    surface.scrollTop += direction * SCROLL_STEP;
    if (previous === surface.scrollTop) return;
    updateRange(point.x, Math.max(top + 1, Math.min(point.y, bottom - 1)));
    frame = requestAnimationFrame(scroll);
  }
  return {
    move(x: number, y: number) {
      point = { x, y };
      if (!frame) frame = requestAnimationFrame(scroll);
    },
    stop() { cancelAnimationFrame(frame); point = null; }
  };
}
