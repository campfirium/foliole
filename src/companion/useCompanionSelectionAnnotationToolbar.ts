import { useCallback, useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type SetStateAction } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { traceAndroidSelection } from '../shared/platform/supportLog/androidSelectionTrace';
import { recordSupportEvent } from '../shared/platform/supportLog/supportLog';

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
import { useCompanionAdjustableReadingRange } from './useCompanionAdjustableReadingRange';
import { useCompanionAndroidReadingSelection } from './useCompanionAndroidReadingSelection';
import { useCompanionSelectionAnnotationDocumentEvents } from './useCompanionSelectionAnnotationDocumentEvents';
import { useCompanionSelectReadingParagraph } from './useCompanionSelectReadingParagraph';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';
function useCompanionSelectionAnnotationOpenHandler(args: {
  canCreateAnnotation: boolean;
  hasAdjustableSelection: () => boolean;
  clearScheduledOpen: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  lastFallbackRef: MutableRefObject<CompanionSelectionClientPoint | null>;
  lastSelectionInteractionAtRef: MutableRefObject<number>;
  nodeId: string;
  scheduleSelectionToolbarOpen: (fallback?: CompanionSelectionClientPoint) => void;
  setSelectionToolbar: Dispatch<SetStateAction<CompanionSelectionAnnotationToolbarState | null>>;
  snapshot: WorkspaceSnapshot | null;
}) {
  return useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (toolbarDom.isCompanionArticleInteractiveTarget(event.target) || !args.canCreateAnnotation) return;
    const highlightTarget = isExistingHighlightTarget(event.target);
    const fallback = readSelectionClientPoint(event) ?? getDefaultSelectionClientPoint();
    // A browser click identifies a tap. Selection releases can also follow a scroll.
    if (event.type === 'click') {
      if (!highlightTarget) return;
      const existingHighlight = resolveExistingHighlightAtPoint({ ...args, point: fallback });
      if (!existingHighlight) return;
      args.clearScheduledOpen();
      toolbarDom.activateCompanionHighlightTarget(event.target);
      args.setSelectionToolbar(resolveExistingHighlightToolbarState(existingHighlight, fallback));
      return;
    }
    if (highlightTarget) return;
    args.lastFallbackRef.current = fallback;
    args.lastSelectionInteractionAtRef.current = Date.now();
    window.requestAnimationFrame(() => {
      if (args.hasAdjustableSelection()) return;
      const adapter = args.editorRef.current;
      const payload = resolveCompanionSelectionCommandPayload(args.nodeId, adapter);
      if (payload && adapter) {
        toolbarDom.clearCompanionActiveHighlightElements();
        args.lastPayloadRef.current = payload;
        args.setSelectionToolbar(resolveSelectionToolbarState({ content: adapter.getContent(), fallback, payload, snapshot: args.snapshot }));
      }
      else args.scheduleSelectionToolbarOpen(fallback);
    });
  }, [args]);
}

function useCompanionSelectionAnnotationScheduler(args: {
  canCreateAnnotation: boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  nodeId: string;
  setSelectionToolbar: Dispatch<SetStateAction<CompanionSelectionAnnotationToolbarState | null>>;
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
    fallback = lastFallbackRef.current ?? getDefaultSelectionClientPoint()
  ) => {
    if (!args.canCreateAnnotation) return;
    clearScheduledOpen();
    settleTimerRef.current = window.setTimeout(() => {
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        settleTimerRef.current = null;
        if (!args.canCreateAnnotation) return;
        const adapter = args.editorRef.current;
        const payload = resolveCompanionSelectionCommandPayload(args.nodeId, adapter);
        if (payload && adapter) {
          recordSupportEvent('selection.toolbar.shown');
          toolbarDom.clearCompanionActiveHighlightElements();
          args.lastPayloadRef.current = payload;
          args.setSelectionToolbar(resolveSelectionToolbarState({ content: adapter.getContent(), fallback, payload, snapshot: args.snapshot }));
          return;
        }
        recordSupportEvent(window.getSelection()?.isCollapsed
          ? 'selection.toolbar.collapsed' : 'selection.toolbar.no_range');
        args.setSelectionToolbar((current) => current?.existingHighlight ? current : null);
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

function useClearSelectionAndCloseToolbar(args: {
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastPayloadRef: MutableRefObject<CompanionSelectionAnnotationToolbarState['payload']>;
  scheduler: ReturnType<typeof useCompanionSelectionAnnotationScheduler>;
  setSelectionToolbar: Dispatch<SetStateAction<CompanionSelectionAnnotationToolbarState | null>>;
}) {
  const { editorRef, lastPayloadRef, scheduler, setSelectionToolbar } = args;
  return useCallback(() => {
    scheduler.clearScheduledOpen();
    scheduler.lastSelectionInteractionAtRef.current = 0;
    toolbarDom.clearCompanionActiveHighlightElements();
    lastPayloadRef.current = null;
    const selection = editorRef.current?.getSelection();
    const collapseAt = selection ? Math.max(selection.from, selection.to) : 0;
    traceAndroidSelection('clear');
    window.getSelection()?.removeAllRanges();
    editorRef.current?.setSelection({ from: collapseAt, to: collapseAt });
    setSelectionToolbar(null);
  }, [editorRef, lastPayloadRef, scheduler, setSelectionToolbar]);
}

function useOwnedSelectionToolbar(nodeId: string) {
  const [ownedToolbar, setOwnedToolbar] = useState<{ nodeId: string; state: CompanionSelectionAnnotationToolbarState | null }>({ nodeId, state: null });
  const activeNode = useRef(nodeId);
  activeNode.current = nodeId;
  const setSelectionToolbar = useCallback((next: SetStateAction<CompanionSelectionAnnotationToolbarState | null>) => {
    if (activeNode.current !== nodeId) return;
    setOwnedToolbar((owned) => {
      const current = owned.nodeId === nodeId ? owned.state : null;
      const state = typeof next === 'function' ? next(current) : next;
      return owned.nodeId === nodeId && state === current ? owned : { nodeId, state };
    });
  }, [nodeId]);
  const selectionToolbar = ownedToolbar.nodeId === nodeId ? ownedToolbar.state : null;
  return [selectionToolbar, setSelectionToolbar] as const;
}

function useHasOpenToolbar(open: boolean) {
  const openRef = useRef(open);
  openRef.current = open;
  return useCallback(() => openRef.current, []);
}

function createdHighlightActivation(
  clear: () => void,
  set: (state: CompanionSelectionAnnotationToolbarState) => void,
  scheduler: ReturnType<typeof useCompanionSelectionAnnotationScheduler>
) {
  return (target: Parameters<typeof resolveExistingHighlightToolbarState>[0]) => {
    clear();
    set(resolveExistingHighlightToolbarState(target, scheduler.lastFallbackRef.current ?? getDefaultSelectionClientPoint()));
  };
}

export function useCompanionSelectionAnnotationToolbar(props: {
  canCreateAnnotation: boolean;
  /** While editing, taps and selections belong to the editor. Otherwise dismissing them is basic reading. */
  editing?: boolean;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const [selectionToolbar, setSelectionToolbar] = useOwnedSelectionToolbar(props.nodeId);
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastPayloadRef = useRef<CompanionSelectionAnnotationToolbarState['payload']>(null);
  const toolbarArgs = { ...props, editorRef, lastPayloadRef, setSelectionToolbar };
  const scheduler = useCompanionSelectionAnnotationScheduler(toolbarArgs);
  const managed = useCompanionAdjustableReadingRange({
    ...props, editorRef, clearScheduledOpen: scheduler.clearScheduledOpen, setToolbar: setSelectionToolbar
  });
  useCompanionAndroidReadingSelection({ enabled: props.canCreateAnnotation, nodeId: props.nodeId, editorRef, accept: managed.accept });
  const closeSelectionToolbar = useCallback(() => {
    if (managed.hasSelection()) return;
    scheduler.clearScheduledOpen();
    toolbarDom.clearCompanionActiveHighlightElements();
    lastPayloadRef.current = null;
    setSelectionToolbar(null);
  }, [lastPayloadRef, managed, scheduler]);
  const handleEditorReady = useCallback((adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  }, []);
  const clearNative = useClearSelectionAndCloseToolbar({ editorRef, lastPayloadRef, scheduler, setSelectionToolbar });
  const clearSelectionAndCloseToolbar = () => { managed.clear(); clearNative(); };
  const selectionActions = useCompanionSelectReadingParagraph({
    ...props, editorRef, lastPayloadRef, setSelectionToolbar, scheduler, managed
  });
  const openSelectionToolbar = useCompanionSelectionAnnotationOpenHandler({
    ...toolbarArgs, ...scheduler, hasAdjustableSelection: managed.hasSelection
  });

  const hasOpenSelectionToolbar = useHasOpenToolbar(selectionToolbar !== null);

  useCompanionSelectionAnnotationDocumentEvents({
    enabled: !props.editing,
    hasAdjustableSelection: managed.hasSelection,
    hasOpenSelectionToolbar,
    clearSelectionAndCloseToolbar,
    closeSelectionToolbar,
    editorRef,
    lastFallbackRef: scheduler.lastFallbackRef,
    lastSelectionInteractionAtRef: scheduler.lastSelectionInteractionAtRef,
    scheduleSelectionToolbarOpen: scheduler.scheduleSelectionToolbarOpen
  });
  useEffect(() => scheduler.clearScheduledOpen, [scheduler.clearScheduledOpen, props.nodeId, props.canCreateAnnotation]);

  return {
    // What a reader sees as selected: a native range or the one Foliole manages. Page turns wait for it.
    hasReadingSelection: () => managed.hasSelection() || window.getSelection()?.isCollapsed === false,
    activateCreatedHighlight: createdHighlightActivation(clearSelectionAndCloseToolbar, setSelectionToolbar, scheduler),
    closeSelectionToolbar,
    clearSelectionAndCloseToolbar,
    editorRef,
    handleEditorReady,
    openSelectionToolbar,
    ...selectionActions,
    selectionToolbar,
    managed,
    setSelectionToolbar
  };
}
