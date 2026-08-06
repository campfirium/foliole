import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import type { CompanionSelectionAnnotationToolbarState } from './CompanionSelectionAnnotationToolbar';
import { resolveCompanionSelectionCommandPayload } from './companionSelectionCommandPayload';
import * as toolbarDom from './companionSelectionToolbarDom';
import {
  getDefaultSelectionClientPoint,
  isExistingHighlightTarget,
  readSelectionClientPoint,
  resolveExistingHighlightAtPoint,
  resolveExistingHighlightToolbarState,
  resolveSelectionToolbarState,
  type CompanionSelectionClientPoint
} from './companionSelectionToolbarState';
import { useCompanionSelectionAnnotationDocumentEvents } from './useCompanionSelectionAnnotationDocumentEvents';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';
function useCompanionSelectionAnnotationOpenHandler(args: {
  canCreateAnnotation: boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  lastFallbackRef: MutableRefObject<CompanionSelectionClientPoint | null>;
  lastSelectionInteractionAtRef: MutableRefObject<number>;
  nodeId: string;
  scheduleSelectionToolbarOpen: (fallback?: CompanionSelectionClientPoint, allowExistingHighlight?: boolean) => void;
  setSelectionToolbar: (state: CompanionSelectionAnnotationToolbarState | null) => void;
  snapshot: WorkspaceSnapshot | null;
}) {
  return useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (toolbarDom.isCompanionSelectionToolbarTarget(event.target) || !args.canCreateAnnotation) return;
    const fallback = readSelectionClientPoint(event) ?? getDefaultSelectionClientPoint();
    args.lastFallbackRef.current = fallback;
    args.lastSelectionInteractionAtRef.current = Date.now();
    window.requestAnimationFrame(() => {
      if (isExistingHighlightTarget(event.target)) {
        const existingHighlight = resolveExistingHighlightAtPoint({ ...args, point: fallback });
        if (existingHighlight) {
          toolbarDom.activateCompanionHighlightTarget(event.target);
          args.setSelectionToolbar(resolveExistingHighlightToolbarState(existingHighlight, fallback));
          return;
        }
        toolbarDom.clearCompanionActiveHighlightElements();
      }
      const payload = resolveCompanionSelectionCommandPayload(args.nodeId, args.editorRef.current);
      if (payload) {
        toolbarDom.clearCompanionActiveHighlightElements();
        args.lastPayloadRef.current = payload;
        args.setSelectionToolbar(resolveSelectionToolbarState({ fallback, payload, snapshot: args.snapshot }));
      }
      else args.scheduleSelectionToolbarOpen(fallback, false);
    });
  }, [args]);
}

function useCompanionSelectionAnnotationScheduler(args: {
  canCreateAnnotation: boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  nodeId: string;
  setSelectionToolbar: (state: CompanionSelectionAnnotationToolbarState | null) => void;
  snapshot: WorkspaceSnapshot | null;
}) {
  const frameRef = useRef<number | null>(null);
  const lastFallbackRef = useRef<CompanionSelectionClientPoint | null>(null);
  const lastSelectionInteractionAtRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
  const clearScheduledOpen = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    frameRef.current = null;
    settleTimerRef.current = null;
  }, []);
  const scheduleSelectionToolbarOpen = useCallback((
    fallback = lastFallbackRef.current ?? getDefaultSelectionClientPoint(),
    allowExistingHighlight = false
  ) => {
    if (!args.canCreateAnnotation) return;
    clearScheduledOpen();
    settleTimerRef.current = window.setTimeout(() => {
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        settleTimerRef.current = null;
        if (!args.canCreateAnnotation) return;
        const existingHighlight = allowExistingHighlight ? resolveExistingHighlightAtPoint({ ...args, point: fallback }) : null;
        if (existingHighlight) {
          args.setSelectionToolbar(resolveExistingHighlightToolbarState(existingHighlight, fallback));
          return;
        }
        const payload = resolveCompanionSelectionCommandPayload(args.nodeId, args.editorRef.current);
        if (payload) {
          toolbarDom.clearCompanionActiveHighlightElements();
          args.lastPayloadRef.current = payload;
          args.setSelectionToolbar(resolveSelectionToolbarState({ fallback, payload, snapshot: args.snapshot }));
          return;
        }
        args.setSelectionToolbar(null);
      });
    }, toolbarDom.SELECTION_SETTLE_DELAY_MS);
  }, [args, clearScheduledOpen]);
  return {
    clearScheduledOpen,
    lastFallbackRef,
    lastSelectionInteractionAtRef,
    scheduleSelectionToolbarOpen
  };
}

function useSelectionPayloadResolver(args: {
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  nodeId: string;
}) {
  const { editorRef, lastPayloadRef, nodeId } = args;
  return useCallback(() => resolveCompanionSelectionCommandPayload(
    nodeId,
    editorRef.current,
    lastPayloadRef.current
  ), [editorRef, lastPayloadRef, nodeId]);
}

function useClearSelectionAndCloseToolbar(args: {
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  scheduler: ReturnType<typeof useCompanionSelectionAnnotationScheduler>;
  setSelectionToolbar: (state: CompanionSelectionAnnotationToolbarState | null) => void;
}) {
  const { editorRef, lastPayloadRef, scheduler, setSelectionToolbar } = args;
  return useCallback(() => {
    scheduler.clearScheduledOpen();
    scheduler.lastSelectionInteractionAtRef.current = 0;
    toolbarDom.clearCompanionActiveHighlightElements();
    lastPayloadRef.current = null;
    const selection = editorRef.current?.getSelection();
    const collapseAt = selection ? Math.max(selection.from, selection.to) : 0;
    window.getSelection()?.removeAllRanges();
    editorRef.current?.setSelection({ from: collapseAt, to: collapseAt });
    setSelectionToolbar(null);
  }, [editorRef, lastPayloadRef, scheduler, setSelectionToolbar]);
}

export function useCompanionSelectionAnnotationToolbar(props: {
  canCreateAnnotation: boolean;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const [selectionToolbar, setSelectionToolbar] = useState<CompanionSelectionAnnotationToolbarState | null>(null);
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastPayloadRef = useRef<CompanionSelectionAnnotationToolbarState['payload']>(null);
  const scheduler = useCompanionSelectionAnnotationScheduler({
    canCreateAnnotation: props.canCreateAnnotation,
    editorRef,
    lastPayloadRef,
    nodeId: props.nodeId,
    setSelectionToolbar,
    snapshot: props.snapshot
  });
  const closeSelectionToolbar = useCallback(() => {
    scheduler.clearScheduledOpen();
    toolbarDom.clearCompanionActiveHighlightElements();
    lastPayloadRef.current = null;
    setSelectionToolbar(null);
  }, [lastPayloadRef, scheduler]);
  const handleEditorReady = useCallback((adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  }, []);
  const clearSelectionAndCloseToolbar = useClearSelectionAndCloseToolbar({ editorRef, lastPayloadRef, scheduler, setSelectionToolbar });
  const resolveSelectionPayload = useSelectionPayloadResolver({ editorRef, lastPayloadRef, nodeId: props.nodeId });

  const openSelectionToolbar = useCompanionSelectionAnnotationOpenHandler({
    canCreateAnnotation: props.canCreateAnnotation,
    editorRef,
    lastPayloadRef,
    lastFallbackRef: scheduler.lastFallbackRef,
    lastSelectionInteractionAtRef: scheduler.lastSelectionInteractionAtRef,
    nodeId: props.nodeId,
    scheduleSelectionToolbarOpen: scheduler.scheduleSelectionToolbarOpen,
    setSelectionToolbar,
    snapshot: props.snapshot
  });

  useCompanionSelectionAnnotationDocumentEvents({
    closeSelectionToolbar,
    lastFallbackRef: scheduler.lastFallbackRef,
    lastSelectionInteractionAtRef: scheduler.lastSelectionInteractionAtRef,
    scheduleSelectionToolbarOpen: scheduler.scheduleSelectionToolbarOpen
  });
  useEffect(() => scheduler.clearScheduledOpen, [scheduler]);

  return {
    closeSelectionToolbar,
    clearSelectionAndCloseToolbar,
    editorRef,
    handleEditorReady,
    openSelectionToolbar,
    resolveSelectionPayload,
    selectionToolbar
  };
}
