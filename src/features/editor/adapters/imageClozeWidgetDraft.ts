export interface DraftRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toPercentValue(value: number) {
  return `${value * 100}%`;
}

function mapPointerToRatio(event: PointerEvent, overlay: HTMLElement) {
  const rect = overlay.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: clampRatio((event.clientX - rect.left) / rect.width),
    y: clampRatio((event.clientY - rect.top) / rect.height)
  };
}

function normalizeDraftRect(startX: number, startY: number, endX: number, endY: number): DraftRect {
  return {
    height: Math.abs(endY - startY),
    width: Math.abs(endX - startX),
    x: Math.min(startX, endX),
    y: Math.min(startY, endY)
  };
}

export function updateDraftRectElement(element: HTMLElement, draftRect: DraftRect | null) {
  if (!draftRect) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  element.style.left = toPercentValue(draftRect.x);
  element.style.top = toPercentValue(draftRect.y);
  element.style.width = toPercentValue(draftRect.width);
  element.style.height = toPercentValue(draftRect.height);
}

function finalizeDraftRect(args: {
  actions: HTMLElement;
  draftRect: DraftRect | null;
  onFinalize: (anchorPoint: { x: number; y: number }) => void;
  overlay: HTMLElement;
  pointerEvent: PointerEvent;
  pointerId: number;
  resetDraft: () => void;
}) {
  if (args.overlay.hasPointerCapture(args.pointerId)) {
    args.overlay.releasePointerCapture(args.pointerId);
  }
  if (!args.draftRect || args.draftRect.width < 0.01 || args.draftRect.height < 0.01) {
    args.resetDraft();
    return;
  }
  const rect = args.overlay.getBoundingClientRect();
  args.onFinalize({
    x: Math.max(0, Math.min(rect.width, args.pointerEvent.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, args.pointerEvent.clientY - rect.top))
  });
  args.actions.hidden = false;
}

export function attachOverlayDragHandlers(args: {
  actions: HTMLElement;
  draftRectElement: HTMLElement;
  onFinalize: (anchorPoint: { x: number; y: number }) => void;
  overlay: HTMLElement;
}) {
  let dragStart: { x: number; y: number } | null = null;
  let draftRect: DraftRect | null = null;

  const stopDragging = () => {
    dragStart = null;
  };

  const updateDraft = (nextDraftRect: DraftRect | null) => {
    draftRect = nextDraftRect;
    updateDraftRectElement(args.draftRectElement, nextDraftRect);
  };

  const resetDraft = () => {
    dragStart = null;
    updateDraft(null);
  };

  args.overlay.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    if (event.target !== args.overlay) {
      return;
    }
    const point = mapPointerToRatio(event, args.overlay);
    if (!point) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    args.overlay.setPointerCapture(event.pointerId);
    dragStart = point;
    args.actions.hidden = true;
    updateDraft({ height: 0, width: 0, x: point.x, y: point.y });
  });

  args.overlay.addEventListener('pointermove', (event) => {
    if (!dragStart) {
      return;
    }
    const point = mapPointerToRatio(event, args.overlay);
    if (!point) {
      return;
    }
    updateDraft(normalizeDraftRect(dragStart.x, dragStart.y, point.x, point.y));
  });

  args.overlay.addEventListener('pointerup', (event) => {
    finalizeDraftRect({
      actions: args.actions,
      draftRect,
      onFinalize: args.onFinalize,
      overlay: args.overlay,
      pointerEvent: event,
      pointerId: event.pointerId,
      resetDraft
    });
    stopDragging();
  });
  args.overlay.addEventListener('pointercancel', () => {
    stopDragging();
    resetDraft();
  });

  return {
    getDraftRect: () => draftRect,
    isDragging: () => dragStart !== null,
    resetDraft
  };
}
