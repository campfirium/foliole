import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import type { CompanionSelectionAnnotationToolbarState } from './CompanionSelectionAnnotationToolbar';
import { resolveCompanionSelectionCommandPayload } from './companionSelectionCommandPayload';
import {
  getDefaultSelectionClientPoint,
  isExistingHighlightTarget,
  readSelectionClientPoint,
  resolveExistingHighlightAtCurrentCursor,
  resolveExistingHighlightToolbarState,
  resolveSelectionToolbarState,
  type CompanionSelectionClientPoint
} from './companionSelectionToolbarState';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';

const RECENT_SELECTION_INTERACTION_MS = 2_000;
const SELECTION_SETTLE_DELAY_MS = 240;

export function isCompanionSelectionToolbarTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-companion-selection-toolbar="true"]') !== null;
}

function hasRecentSelectionInteraction(lastInteractionAt: number) {
  return lastInteractionAt > 0 && Date.now() - lastInteractionAt < RECENT_SELECTION_INTERACTION_MS;
}

function useCompanionSelectionAnnotationDocumentEvents(args: {
  closeSelectionToolbar: () => void;
  lastFallbackRef: MutableRefObject<CompanionSelectionClientPoint | null>;
  lastSelectionInteractionAtRef: MutableRefObject<number>;
  scheduleSelectionToolbarOpen: (fallback?: CompanionSelectionClientPoint, allowExistingHighlight?: boolean) => void;
}) {
  useEffect(() => {
    const rememberSelectionInteraction = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (isCompanionSelectionToolbarTarget(event.target)) return;
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      args.closeSelectionToolbar();
    };
    const handleSelectionEnd = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (isCompanionSelectionToolbarTarget(event.target)) return;
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      args.scheduleSelectionToolbarOpen(args.lastFallbackRef.current, isExistingHighlightTarget(event.target));
    };
    const handleSelectionChange = () => {
      if (hasRecentSelectionInteraction(args.lastSelectionInteractionAtRef.current)) {
        args.scheduleSelectionToolbarOpen(undefined, false);
      }
    };
    document.addEventListener('pointerdown', rememberSelectionInteraction, true);
    document.addEventListener('pointermove', rememberSelectionInteraction, true);
    document.addEventListener('pointerup', handleSelectionEnd, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionEnd, true);
    document.addEventListener('touchmove', rememberSelectionInteraction, true);
    return () => {
      document.removeEventListener('pointerdown', rememberSelectionInteraction, true);
      document.removeEventListener('pointermove', rememberSelectionInteraction, true);
      document.removeEventListener('pointerup', handleSelectionEnd, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionEnd, true);
      document.removeEventListener('touchmove', rememberSelectionInteraction, true);
    };
  }, [args]);
}

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
    if (isCompanionSelectionToolbarTarget(event.target) || !args.canCreateAnnotation) return;
    const fallback = readSelectionClientPoint(event) ?? getDefaultSelectionClientPoint();
    args.lastFallbackRef.current = fallback;
    args.lastSelectionInteractionAtRef.current = Date.now();
    window.requestAnimationFrame(() => {
      const payload = resolveCompanionSelectionCommandPayload(args.nodeId, args.editorRef.current);
      if (payload) {
        args.lastPayloadRef.current = payload;
        args.setSelectionToolbar(resolveSelectionToolbarState({ fallback, payload, snapshot: args.snapshot }));
      }
      else if (isExistingHighlightTarget(event.target)) {
        const existingHighlight = resolveExistingHighlightAtCurrentCursor(args);
        args.setSelectionToolbar(existingHighlight ? resolveExistingHighlightToolbarState(existingHighlight, fallback) : null);
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
        const payload = resolveCompanionSelectionCommandPayload(args.nodeId, args.editorRef.current);
        if (payload) {
          args.lastPayloadRef.current = payload;
          args.setSelectionToolbar(resolveSelectionToolbarState({ fallback, payload, snapshot: args.snapshot }));
          return;
        }
        const existingHighlight = allowExistingHighlight ? resolveExistingHighlightAtCurrentCursor(args) : null;
        args.setSelectionToolbar(existingHighlight ? resolveExistingHighlightToolbarState(existingHighlight, fallback) : null);
      });
    }, SELECTION_SETTLE_DELAY_MS);
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
  return useCallback(() => (
    resolveCompanionSelectionCommandPayload(nodeId, editorRef.current) ?? lastPayloadRef.current
  ), [editorRef, lastPayloadRef, nodeId]);
}

function useClearSelectionAndCloseToolbar(args: {
  editorRef: MutableRefObject<EditorAdapter | null>;
  scheduler: ReturnType<typeof useCompanionSelectionAnnotationScheduler>;
  setSelectionToolbar: (state: CompanionSelectionAnnotationToolbarState | null) => void;
}) {
  const { editorRef, scheduler, setSelectionToolbar } = args;
  return useCallback(() => {
    scheduler.clearScheduledOpen();
    scheduler.lastSelectionInteractionAtRef.current = 0;
    const selection = editorRef.current?.getSelection();
    const collapseAt = selection ? Math.max(selection.from, selection.to) : 0;
    window.getSelection()?.removeAllRanges();
    editorRef.current?.setSelection({ from: collapseAt, to: collapseAt });
    setSelectionToolbar(null);
  }, [editorRef, scheduler, setSelectionToolbar]);
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
    setSelectionToolbar(null);
  }, [scheduler]);
  const handleEditorReady = useCallback((adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  }, []);
  const clearSelectionAndCloseToolbar = useClearSelectionAndCloseToolbar({ editorRef, scheduler, setSelectionToolbar });
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
