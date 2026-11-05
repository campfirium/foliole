import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { HighlightRangeHandlesProps } from './HighlightRangeHandles';

type Range = { from: number; to: number };
type Args = Pick<HighlightRangeHandlesProps, 'editor' | 'highlight' | 'onCommit' | 'disabled'> & {
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

export function useHighlightRangeDrag(args: Args) {
  const cancelRef = useRef<(() => void) | null>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => () => cancelRef.current?.(), [args.editor, args.highlight?.nodeId]);
  function start(side: 'from' | 'to', event: ReactPointerEvent<HTMLButtonElement>) {
    if (!args.editor || !args.highlight || args.disabled || pending.current) return;
    cancelRef.current?.();
    const target = captureHandle(event);
    const { editor, highlight } = args;
    const base = args.draftRange ?? highlight.locator;
    let draft: Range | null = null;
    let active = true;
    const clearPreview = () => { editor.setHighlightRangePreview?.(highlight.nodeId, null); args.setDraftRange(null); };
    const cleanup = () => {
      delete target.dataset.highlightRangeDragging;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', commit);
      document.removeEventListener('pointercancel', cancel);
      if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };
    const cancel = (pointer?: PointerEvent) => {
      if (pointer && pointer.pointerId !== event.pointerId) return;
      active = false; cleanup(); clearPreview();
    };
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return;
      pointer.preventDefault();
      const position = editor.getDocumentPositionAtClientPoint?.(pointer.clientX, pointer.clientY);
      if (position == null) return;
      draft = side === 'from'
        ? { from: Math.min(position, base.to - 1), to: base.to }
        : { from: base.from, to: Math.max(position, base.from + 1) };
      window.getSelection()?.removeAllRanges();
      args.setDraftRange(draft);
      editor.setHighlightRangePreview?.(highlight.nodeId, draft);
    };
    const commit = (pointer: PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return;
      cleanup();
      if (!draft) { clearPreview(); return; }
      const range = draft;
      const retain = (applied: boolean) => {
        if (!active) return;
        editor.setHighlightRangePreview?.(highlight.nodeId, applied ? range : null);
        args.setDraftRange(applied ? range : null);
      };
      settleRange(() => args.onCommit(highlight.nodeId, range), retain, value => {
        pending.current = value;
        if (active) setSaving(value);
      });
    };
    cancelRef.current = cancel;
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', commit);
    document.addEventListener('pointercancel', cancel);
  }
  return { start, saving };
}
