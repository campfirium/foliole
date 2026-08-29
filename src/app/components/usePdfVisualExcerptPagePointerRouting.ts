import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { onPdfVisualSelectionKindChange, setPdfVisualSelectionKind, type PdfVisualSelectionKind } from './pdfSurfaceRegistration';
import { rectFromPointerDrag, type PdfNormalizedRect } from './pdfVisualExcerptGeometry';
import { canStartPdfVisualExcerpt, isPdfVisualExcerptModifierPressed, type PdfVisualExcerptInteractionMode } from './pdfVisualExcerptInteractionMode';
import { findPdfExcerptNearEdge, resolvePdfVisualExcerptPointerAction } from './pdfVisualExcerptPointerRouting';
import { usePdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

type PagePointerRuntime = ReturnType<typeof usePdfVisualExcerptRuntime>;
type PageDrag = { pointerId: number; start: { x: number; y: number } };
export type PdfVisualExcerptPendingNote = { left: number; page: number; rect: PdfNormalizedRect; top: number };

function pointRatio(event: PointerEvent, element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
  };
}

function listenForPagePointers(root: HTMLElement, handlers: {
  cancel: (event: PointerEvent) => void;
  down: (event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
}) {
  root.addEventListener('pointerdown', handlers.down, true);
  root.addEventListener('pointermove', handlers.move, true);
  root.addEventListener('pointerup', handlers.up, true);
  root.addEventListener('pointercancel', handlers.cancel, true);
  return () => {
    root.classList.remove('pdf-visual-excerpt-page', 'pdf-visual-excerpt-enabled', 'pdf-visual-excerpt-near-edge');
    root.removeEventListener('pointerdown', handlers.down, true);
    root.removeEventListener('pointermove', handlers.move, true);
    root.removeEventListener('pointerup', handlers.up, true);
    root.removeEventListener('pointercancel', handlers.cancel, true);
  };
}

function installModifierCursorRouting(
  root: HTMLElement,
  mode: PdfVisualExcerptInteractionMode,
  explicitSelection: boolean
) {
  let modifierPressed = false;
  let pointerInside = false;
  const sync = () => root.classList.toggle('pdf-visual-excerpt-enabled', canStartPdfVisualExcerpt({
    explicitSelection, mode, modifierPressed
  }));
  const onPointerEnter = (event: PointerEvent) => {
    pointerInside = true;
    modifierPressed = isPdfVisualExcerptModifierPressed(event);
    sync();
  };
  const onPointerLeave = () => {
    pointerInside = false;
    modifierPressed = false;
    sync();
  };
  const onModifier = (event: KeyboardEvent) => {
    if (event.key !== 'Alt') return;
    modifierPressed = event.type === 'keydown' && pointerInside;
    if (pointerInside) event.preventDefault();
    sync();
  };
  const clear = () => {
    modifierPressed = false;
    sync();
  };
  root.addEventListener('pointerenter', onPointerEnter);
  root.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onModifier, true);
  window.addEventListener('keyup', onModifier, true);
  window.addEventListener('blur', clear);
  sync();
  return () => {
    root.removeEventListener('pointerenter', onPointerEnter);
    root.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('keydown', onModifier, true);
    window.removeEventListener('keyup', onModifier, true);
    window.removeEventListener('blur', clear);
  };
}

function createNearEdgeResolver(root: HTMLElement, locators: Array<{ nodeId: string; rect: PdfNormalizedRect }>) {
  return (event: PointerEvent) => {
    const bounds = root.getBoundingClientRect();
    return findPdfExcerptNearEdge(pointRatio(event, root), locators, {
      x: 6 / Math.max(1, bounds.width), y: 6 / Math.max(1, bounds.height)
    });
  };
}

function finishPageDrag(args: {
  create: boolean;
  dragRef: MutableRefObject<PageDrag | null>;
  event: PointerEvent;
  pageNumber: number;
  root: HTMLElement;
  runtime: PagePointerRuntime;
  setPendingNote: Dispatch<SetStateAction<PdfVisualExcerptPendingNote | null>>;
  setPreview: Dispatch<SetStateAction<PdfNormalizedRect | null>>;
  visualSelectionKind: PdfVisualSelectionKind | null;
}) {
  const drag = args.dragRef.current;
  if (!drag || drag.pointerId !== args.event.pointerId) return;
  const point = pointRatio(args.event, args.root);
  const next = rectFromPointerDrag(drag.start.x, drag.start.y, point.x, point.y);
  args.dragRef.current = null;
  args.setPreview(null);
  if (args.root.hasPointerCapture(args.event.pointerId)) args.root.releasePointerCapture(args.event.pointerId);
  const bounds = args.root.getBoundingClientRect();
  if (!args.create || next.width * bounds.width < 8 || next.height * bounds.height < 8) return;
  if (args.visualSelectionKind === 'note') {
    args.setPendingNote({ left: args.event.clientX, page: args.pageNumber, rect: next, top: args.event.clientY });
  } else {
    void args.runtime.createDisplayedRect(args.pageNumber, next);
  }
  setPdfVisualSelectionKind(null);
}

function installPagePointerRouting(args: {
  dragRef: MutableRefObject<PageDrag | null>;
  locators: Array<{ nodeId: string; rect: PdfNormalizedRect }>;
  mode: PdfVisualExcerptInteractionMode;
  pageNumber: number;
  root: HTMLElement;
  runtime: PagePointerRuntime;
  setPendingNote: Dispatch<SetStateAction<PdfVisualExcerptPendingNote | null>>;
  setPreview: Dispatch<SetStateAction<PdfNormalizedRect | null>>;
  visualSelectionKind: PdfVisualSelectionKind | null;
}) {
  const { dragRef, locators, mode, pageNumber, root, runtime, setPendingNote, setPreview, visualSelectionKind } = args;
  root.classList.add('pdf-visual-excerpt-page');
  const removeModifierCursorRouting = installModifierCursorRouting(root, mode, Boolean(visualSelectionKind));
  const nearEdge = createNearEdgeResolver(root, locators);
  const onPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const point = pointRatio(event, root);
      setPreview(rectFromPointerDrag(drag.start.x, drag.start.y, point.x, point.y));
      return;
    }
    const action = resolvePdfVisualExcerptPointerAction(event.target, Boolean(nearEdge(event)));
    root.classList.toggle('pdf-visual-excerpt-near-edge', action === 'outline');
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const point = pointRatio(event, root);
    const outline = nearEdge(event);
    const action = resolvePdfVisualExcerptPointerAction(event.target, Boolean(outline));
    if (action === 'control') return;
    if (action === 'outline' && outline) {
      runtime.selectOutline({ nodeId: outline.nodeId, page: pageNumber, ...point });
      return;
    }
    runtime.clearOutlineSelection();
    const eligible = canStartPdfVisualExcerpt({
      explicitSelection: Boolean(visualSelectionKind),
      mode,
      modifierPressed: isPdfVisualExcerptModifierPressed(event)
    });
    if (!eligible) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, start: point };
    setPreview({ ...point, height: 0, width: 0 });
    root.setPointerCapture(event.pointerId);
  };
  const finishDrag = (event: PointerEvent, create: boolean) => finishPageDrag({
    create, dragRef, event, pageNumber, root, runtime, setPendingNote, setPreview, visualSelectionKind
  });
  const removePagePointerRouting = listenForPagePointers(root, {
    cancel: (event) => finishDrag(event, false), down: onPointerDown, move: onPointerMove,
    up: (event) => finishDrag(event, true)
  });
  return () => {
    removeModifierCursorRouting();
    removePagePointerRouting();
  };
}

export function usePdfVisualExcerptPagePointerRouting(pageNumber: number, locators: Array<{ nodeId: string; rect: PdfNormalizedRect }>) {
  const runtime = usePdfVisualExcerptRuntime();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<PageDrag | null>(null);
  const [pendingNote, setPendingNote] = useState<PdfVisualExcerptPendingNote | null>(null);
  const [preview, setPreview] = useState<PdfNormalizedRect | null>(null);
  const [visualSelectionKind, setVisualSelectionKind] = useState<PdfVisualSelectionKind | null>(null);
  useEffect(() => onPdfVisualSelectionKindChange(setVisualSelectionKind), []);
  useEffect(() => {
    if (!visualSelectionKind) return undefined;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPdfVisualSelectionKind(null);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [visualSelectionKind]);
  useEffect(() => {
    const root = layerRef.current?.parentElement;
    return root ? installPagePointerRouting({
      dragRef, locators, mode: runtime.interactionMode, pageNumber, root, runtime, setPendingNote, setPreview, visualSelectionKind
    }) : undefined;
  }, [locators, pageNumber, runtime, runtime.interactionMode, visualSelectionKind]);
  return { layerRef, pendingNote, preview, setPendingNote };
}
