import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { createHighlightRangeEdgeScroll } from './highlightRangeEdgeScroll';
import type { HighlightRangeHandlesProps } from './HighlightRangeHandles';

type Range = { from: number; to: number };
type Args = Pick<HighlightRangeHandlesProps, 'editor' | 'highlight' | 'onCommit' | 'onPreview' | 'scrollSurface' | 'disabled'> & {
  draftRange: Range | null;
  setDraftRange: (range: Range | null) => void;
};

function settleRange(action: () => boolean | Promise<boolean>, retain: (applied: boolean) => void, saving: (value: boolean) => void) {
  try {
    const result = action();
    if (typeof result === 'boolean') { retain(result); return; }
    saving(true);
    void result.then(retain, () => retain(false)).finally(() => saving(false));
  } catch { retain(false); }
}

function captureHandle(event: ReactPointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget;
  target.dataset.highlightRangeDragging = 'true';
  target.setPointerCapture?.(event.pointerId);
  return target;
}

function moveBoundary(base: Range, side: 'from' | 'to', position: number): Range {
  return side === 'from'
    ? { from: Math.min(position, base.to - 1), to: base.to }
    : { from: base.from, to: Math.max(position, base.from + 1) };
}

function trackPointerMove(pointerId: number, updateRange: (x: number, y: number) => void,
  edgeScroll: ReturnType<typeof createHighlightRangeEdgeScroll> | null) {
  return (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    updateRange(pointer.clientX, pointer.clientY);
    edgeScroll?.move(pointer.clientX, pointer.clientY);
  };
}

function trackRangeDrag(args: Args & {
  editor: NonNullable<Args['editor']>;
  highlight: NonNullable<Args['highlight']>;
  side: 'from' | 'to';
  event: ReactPointerEvent<HTMLButtonElement>;
  setCancel(cancel: (() => void) | null): void;
  setPending(value: boolean, active: boolean): void;
}) {
  const { editor, highlight, side, event } = args;
  const target = captureHandle(event);
  const base = args.draftRange ?? highlight.locator;
  let draft: Range | null = null;
  let active = true;
  const preview = (range: Range | null) => {
    if (args.onPreview) args.onPreview(range);
    else editor.setHighlightRangePreview?.(highlight.nodeId, range);
  };
  const clearPreview = () => { preview(null); args.setDraftRange(null); };
  const cleanup = () => {
    edgeScroll?.stop();
    delete target.dataset.highlightRangeDragging;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', commit);
    document.removeEventListener('pointercancel', cancel);
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };
  const cancel = (pointer?: PointerEvent) => {
    if (pointer && pointer.pointerId !== event.pointerId) return;
    active = false; args.setCancel(null); cleanup(); clearPreview();
  };
  const updateRange = (x: number, y: number) => {
    const position = editor.getDocumentPositionAtClientPoint?.(x, y);
    if (position == null) return;
    draft = moveBoundary(base, side, position);
    window.getSelection()?.removeAllRanges();
    args.setDraftRange(draft);
    preview(draft);
  };
  const surface = event.pointerType === 'touch' ? args.scrollSurface : null;
  const edgeScroll = surface ? createHighlightRangeEdgeScroll(surface, updateRange) : null;
  const move = trackPointerMove(event.pointerId, updateRange, edgeScroll);
  const commit = (pointer: PointerEvent) => {
    if (pointer.pointerId !== event.pointerId) return;
    cleanup();
    if (!draft) { args.setCancel(null); clearPreview(); return; }
    const range = draft;
    const retain = (applied: boolean) => {
      if (!active) return;
      args.setCancel(null);
      const retained = applied && !args.onPreview ? range : null;
      preview(retained);
      args.setDraftRange(retained);
    };
    settleRange(() => args.onCommit(highlight.nodeId, range), retain, value => args.setPending(value, active));
  };
  args.setCancel(cancel);
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', commit);
  document.addEventListener('pointercancel', cancel);
}

export function useHighlightRangeDrag(args: Args) {
  const cancelRef = useRef<(() => void) | null>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => () => cancelRef.current?.(), [args.editor, args.highlight?.nodeId]);
  function start(side: 'from' | 'to', event: ReactPointerEvent<HTMLButtonElement>) {
    if (!args.editor || !args.highlight || args.disabled || pending.current) return;
    cancelRef.current?.();
    trackRangeDrag({
      ...args, editor: args.editor, highlight: args.highlight, side, event,
      setCancel: cancel => { cancelRef.current = cancel; },
      setPending: (value, active) => { pending.current = value; if (active) setSaving(value); }
    });
  }
  return { start, saving };
}
