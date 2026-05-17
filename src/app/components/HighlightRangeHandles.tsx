import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

interface HighlightRangeHandlesProps {
  editor: EditorAdapter | null;
  highlight: {
    locator: { from: number; to: number };
    nodeId: string;
  } | null;
  parentContent: string;
  onCommit: (highlightNodeId: string, parentContent: string, range: { from: number; to: number }) => boolean;
}

interface HandlePosition {
  left: number;
  top: number;
}

function resolveHandlePosition(editor: EditorAdapter, position: number, side: 'from' | 'to'): HandlePosition | null {
  const rect = editor.getPositionClientRect?.(position);
  if (!rect) {
    return null;
  }
  return {
    left: side === 'from' ? rect.left : rect.right,
    top: rect.top + rect.height / 2
  };
}

function resolvePositions(editor: EditorAdapter | null, range: { from: number; to: number } | null) {
  if (!editor || !range) {
    return null;
  }
  const from = resolveHandlePosition(editor, range.from, 'from');
  const to = resolveHandlePosition(editor, range.to, 'to');
  return from && to ? { from, to } : null;
}

function useMeasuredPositions(editor: EditorAdapter | null, range: { from: number; to: number } | null) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener('resize', refresh);
    const unsubscribe = editor?.onScroll(refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      unsubscribe?.();
    };
  }, [editor]);
  return useMemo(() => {
    void version;
    return resolvePositions(editor, range);
  }, [editor, range, version]);
}

function HighlightRangeHandle(props: {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  position: HandlePosition;
  side: 'from' | 'to';
}) {
  return (
    <button
      aria-label={props.side === 'from' ? 'Adjust Highlight start' : 'Adjust Highlight end'}
      className="fixed z-floating flex h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-selection-blue/50"
      data-highlight-range-handle="true"
      onPointerDown={props.onPointerDown}
      style={{ left: props.position.left, top: props.position.top }}
      title={props.side === 'from' ? 'Adjust Highlight start' : 'Adjust Highlight end'}
      type="button"
    >
      <span className="h-4 w-0.5 rounded-full bg-foreground/55" />
      <span className="absolute size-3 rounded-full border-2 border-foreground/75 bg-cloze-yellow ring-1 ring-background" />
    </button>
  );
}

export function HighlightRangeHandles(props: HighlightRangeHandlesProps) {
  const [draftRange, setDraftRange] = useState<{ from: number; to: number } | null>(null);
  const draftRangeRef = useRef<{ from: number; to: number } | null>(null);
  const activeRange = draftRange ?? props.highlight?.locator ?? null;
  const positions = useMeasuredPositions(props.editor, activeRange);

  useEffect(() => {
    draftRangeRef.current = null;
    setDraftRange(null);
  }, [props.highlight?.nodeId, props.highlight?.locator.from, props.highlight?.locator.to]);

  const startDrag = useCallback((side: 'from' | 'to', event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!props.editor || !props.highlight) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const baseRange = draftRange ?? props.highlight.locator;
    const move = (pointerEvent: PointerEvent) => {
      const position = props.editor?.getDocumentPositionAtClientPoint?.(pointerEvent.clientX, pointerEvent.clientY);
      if (position === null || position === undefined) {
        return;
      }
      const nextRange = side === 'from'
        ? { from: Math.min(position, baseRange.to - 1), to: baseRange.to }
        : { from: baseRange.from, to: Math.max(position, baseRange.from + 1) };
      draftRangeRef.current = nextRange;
      setDraftRange(nextRange);
    };
    const commit = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', commit);
      const range = draftRangeRef.current;
      if (!range || !props.highlight) {
        return;
      }
      const didCommit = props.onCommit(props.highlight.nodeId, props.parentContent, range);
      draftRangeRef.current = didCommit ? range : null;
      setDraftRange(didCommit ? range : null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', commit);
  }, [draftRange, props]);

  if (!positions || !props.highlight || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      <HighlightRangeHandle onPointerDown={(event) => startDrag('from', event)} position={positions.from} side="from" />
      <HighlightRangeHandle onPointerDown={(event) => startDrag('to', event)} position={positions.to} side="to" />
    </>,
    document.body
  );
}
