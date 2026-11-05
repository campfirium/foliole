import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { useTranslation } from '../localization/LocalizationProvider';

import { useHighlightRangeDrag } from './useHighlightRangeDrag';

export interface HighlightRangeHandlesProps {
  touch?: boolean;
  disabled?: boolean | undefined;
  editor: EditorAdapter | null;
  highlight: {
    kind: 'cloze' | 'highlight';
    locator: { from: number; to: number };
    nodeId: string;
  } | null;
  onCommit: (highlightNodeId: string, range: { from: number; to: number }) => boolean | Promise<boolean>;
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
    document.addEventListener('scroll', refresh, true);
    const unsubscribe = editor?.onScroll(refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      document.removeEventListener('scroll', refresh, true);
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

function HighlightRangeHandle(props: {
  kind: 'cloze' | 'highlight';
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  position: HandlePosition;
  side: 'from' | 'to';
  touch?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const t = useTranslation();
  const label = props.side === 'from' ? t('desktop.highlightRange.start') : t('desktop.highlightRange.end');
  const color = props.kind === 'cloze'
    ? 'rgb(var(--role-cloze-rgb) / 0.82)'
    : 'rgb(var(--role-highlight-rgb) / 0.82)';
  return (
    <button
      aria-label={label}
      disabled={props.disabled}
      className={`fixed z-floating flex ${props.touch ? 'w-11 touch-none select-none' : 'w-4'} cursor-ew-resize items-start justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-selection-blue/50`}
      data-highlight-range-handle="true"
      onPointerDown={props.onPointerDown}
      style={{
        height: Math.max(props.position.height, 18) + (props.touch ? 24 : 0),
        paddingBlock: props.touch ? 12 : 0,
        touchAction: 'none',
        userSelect: 'none',
        left: props.position.left,
        top: props.position.top - (props.touch ? 12 : 0),
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
        style={{ background: color, ...(props.touch ? props.side === 'from' ? { top: 12 } : { bottom: 12 } : {}) }}
      />
    </button>
  );
}

export function HighlightRangeHandles(props: HighlightRangeHandlesProps) {
  const [draftRange, setDraftRange] = useState<HighlightRange | null>(null);

  const activeRange = draftRange ?? props.highlight?.locator ?? null;
  const positions = useMeasuredPositions(props.editor, activeRange);
  const resetDraft = useCallback(() => {
    setDraftRange(null);
  }, []);
  useResetHighlightRangePreview({
    editor: props.editor,
    highlight: props.highlight,
    onResetDraft: resetDraft
  });

  const startDrag = useHighlightRangeDrag({
    draftRange,
    disabled: props.disabled,
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
      <HighlightRangeHandle touch={props.touch} disabled={props.disabled || startDrag.saving} kind={props.highlight.kind} onPointerDown={(event) => startDrag.start('from', event)} position={positions.from} side="from" />
      <HighlightRangeHandle touch={props.touch} disabled={props.disabled || startDrag.saving} kind={props.highlight.kind} onPointerDown={(event) => startDrag.start('to', event)} position={positions.to} side="to" />
    </>,
    document.body
  );
}
