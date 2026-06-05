import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

interface HighlightRangeHandlesProps {
  editor: EditorAdapter | null;
  highlight: {
    kind: 'cloze' | 'highlight';
    locator: { from: number; to: number };
    nodeId: string;
  } | null;
  onCommit: (highlightNodeId: string, range: { from: number; to: number }) => boolean;
}

interface HandlePosition {
  height: number;
  left: number;
  top: number;
}

type HighlightRange = { from: number; to: number };

function resolveHandlePosition(editor: EditorAdapter, position: number, side: 'from' | 'to'): HandlePosition | null {
  const rect = editor.getPositionClientRect?.(position);
  if (!rect) {
    return null;
  }
  return {
    left: side === 'from' ? rect.left : rect.right,
    height: rect.height,
    top: rect.top
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

function useResetHighlightRangePreview(args: {
  editor: EditorAdapter | null;
  highlight: HighlightRangeHandlesProps['highlight'];
  onResetDraft: () => void;
}) {
  const nodeId = args.highlight?.nodeId;
  const from = args.highlight?.locator.from;
  const to = args.highlight?.locator.to;
  useEffect(() => {
    if (nodeId) {
      args.editor?.setHighlightRangePreview?.(nodeId, null);
    }
    args.onResetDraft();
  }, [args.editor, args.onResetDraft, from, nodeId, to]);

  useEffect(() => () => {
    if (nodeId) {
      args.editor?.setHighlightRangePreview?.(nodeId, null);
    }
  }, [args.editor, nodeId]);
}

function useHighlightRangeDrag(args: {
  draftRange: HighlightRange | null;
  draftRangeRef: MutableRefObject<HighlightRange | null>;
  editor: EditorAdapter | null;
  highlight: HighlightRangeHandlesProps['highlight'];
  onCommit: HighlightRangeHandlesProps['onCommit'];
  setDraftRange: (range: HighlightRange | null) => void;
}) {
  return useCallback((side: 'from' | 'to', event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!args.editor || !args.highlight) {
      return;
    }
    const editor = args.editor;
    const highlight = args.highlight;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const baseRange = args.draftRange ?? highlight.locator;
    const move = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      const position = editor.getDocumentPositionAtClientPoint?.(pointerEvent.clientX, pointerEvent.clientY);
      if (position === null || position === undefined) {
        return;
      }
      const nextRange = side === 'from'
        ? { from: Math.min(position, baseRange.to - 1), to: baseRange.to }
        : { from: baseRange.from, to: Math.max(position, baseRange.from + 1) };
      window.getSelection()?.removeAllRanges();
      args.draftRangeRef.current = nextRange;
      args.setDraftRange(nextRange);
      editor.setHighlightRangePreview?.(highlight.nodeId, nextRange);
    };
    const commit = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', commit);
      const range = args.draftRangeRef.current;
      if (!range) {
        editor.setHighlightRangePreview?.(highlight.nodeId, null);
        return;
      }
      const didCommit = args.onCommit(highlight.nodeId, range);
      editor.setHighlightRangePreview?.(highlight.nodeId, didCommit ? range : null);
      args.draftRangeRef.current = didCommit ? range : null;
      args.setDraftRange(didCommit ? range : null);
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', commit);
  }, [args]);
}

function HighlightRangeHandle(props: {
  kind: 'cloze' | 'highlight';
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  position: HandlePosition;
  side: 'from' | 'to';
}) {
  const t = useTranslation();
  const label = props.side === 'from' ? t('desktop.highlightRange.start') : t('desktop.highlightRange.end');
  const color = props.kind === 'cloze'
    ? 'rgb(var(--app-cloze-color-rgb) / 0.82)'
    : 'rgb(var(--app-highlight-color-rgb) / 0.82)';
  return (
    <button
      aria-label={label}
      className="fixed z-floating flex w-4 cursor-ew-resize items-start justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-selection-blue/50"
      data-highlight-range-handle="true"
      onPointerDown={props.onPointerDown}
      style={{
        height: Math.max(props.position.height, 18),
        left: props.position.left,
        top: props.position.top,
        transform: 'translateX(-50%)'
      }}
      title={label}
      type="button"
    >
      <span
        className="h-full w-[3px] rounded-full"
        style={{ background: color }}
      />
      <span
        className={[
          'absolute size-3 rounded-full',
          props.side === 'from' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2'
        ].join(' ')}
        style={{ background: color }}
      />
    </button>
  );
}

export function HighlightRangeHandles(props: HighlightRangeHandlesProps) {
  const [draftRange, setDraftRange] = useState<HighlightRange | null>(null);
  const draftRangeRef = useRef<HighlightRange | null>(null);
  const activeRange = draftRange ?? props.highlight?.locator ?? null;
  const positions = useMeasuredPositions(props.editor, activeRange);
  const resetDraft = useCallback(() => {
    draftRangeRef.current = null;
    setDraftRange(null);
  }, []);
  useResetHighlightRangePreview({
    editor: props.editor,
    highlight: props.highlight,
    onResetDraft: resetDraft
  });

  const startDrag = useHighlightRangeDrag({
    draftRange,
    draftRangeRef,
    editor: props.editor,
    highlight: props.highlight,
    onCommit: props.onCommit,
    setDraftRange
  });

  if (!positions || !props.highlight || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      <HighlightRangeHandle kind={props.highlight.kind} onPointerDown={(event) => startDrag('from', event)} position={positions.from} side="from" />
      <HighlightRangeHandle kind={props.highlight.kind} onPointerDown={(event) => startDrag('to', event)} position={positions.to} side="to" />
    </>,
    document.body
  );
}
