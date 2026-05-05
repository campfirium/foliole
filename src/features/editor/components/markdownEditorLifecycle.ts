import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

import {
  markEditorContentSyncCompleted,
  markEditorContentSyncStarted
} from '../../../shared/platform/performanceDiagnosticsProbe';
import { IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT } from '../../image-cloze/model/imageClozePresentation';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorDiffDecorations } from '../adapters/EditorAdapter';

import { useEditorSelectionRestore } from './markdownEditorSelectionRestore';
import type { EditorViewState } from './markdownEditorTypes';

function useEditorScrollSync(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  syncScrollMetrics: () => void
) {
  useEffect(() => {
    const adapter = adapterRef.current;
    const host = hostRef.current;
    if (!adapter || !host) {
      return;
    }

    const unsubscribeScroll = adapter.onScroll(syncScrollMetrics);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncScrollMetrics()) : null;
    resizeObserver?.observe(host);
    requestAnimationFrame(syncScrollMetrics);

    return () => {
      unsubscribeScroll();
      resizeObserver?.disconnect();
    };
  }, [adapterRef, hostRef, syncScrollMetrics]);
}

function useEditorContentSync(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  nodeId: string | null,
  syncScrollMetrics: () => void,
  value: string,
  lineDiffDecorations: EditorDiffDecorations | null | undefined
) {
  useLayoutEffect(() => {
    if (nodeId) {
      markEditorContentSyncStarted(nodeId, `content:${value.length}`);
    }
    adapterRef.current?.setContent(value);
    if (nodeId) {
      markEditorContentSyncCompleted(nodeId, `content:${value.length}`);
    }
    requestAnimationFrame(syncScrollMetrics);
  }, [adapterRef, nodeId, syncScrollMetrics, value]);

  useEffect(() => {
    adapterRef.current?.setDiffDecorations(lineDiffDecorations ?? null);
    requestAnimationFrame(syncScrollMetrics);
  }, [adapterRef, lineDiffDecorations, syncScrollMetrics]);
}

export function useEditorLayoutEffects(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined,
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined,
  completeApplyingReadingPosition: ((reason: string) => void) | undefined,
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined,
  shouldSuppressSelectionRestore: (() => boolean) | undefined,
  syncScrollMetrics: () => void,
  value: string,
  lineDiffDecorations: EditorDiffDecorations | null | undefined
) {
  useEditorScrollSync(adapterRef, hostRef, syncScrollMetrics);
  useEditorContentSync(adapterRef, nodeId, syncScrollMetrics, value, lineDiffDecorations);
  useEditorSelectionRestore(
    adapterRef,
    nodeId,
    readingSelection,
    nodeViewState,
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    setReadingPositionSelection,
    shouldSuppressSelectionRestore,
    syncScrollMetrics,
    value
  );
}

export function useEditorAppearanceEffects(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hideTitleHeading: boolean,
  nodeId: string | null
) {
  useLayoutEffect(() => {
    adapterRef.current?.setHideTitleHeading(hideTitleHeading);
  }, [adapterRef, hideTitleHeading]);

  useLayoutEffect(() => {
    if (typeof adapterRef.current?.setNodeId === 'function') {
      adapterRef.current.setNodeId(nodeId);
      adapterRef.current.refreshImageClozePresentation();
    }
  }, [adapterRef, nodeId]);

  useLayoutEffect(() => {
    if (!nodeId) {
      return;
    }
    const handlePresentationChange = (event: Event) => {
      const detail = (event as CustomEvent<{ editorNodeId?: string }>).detail;
      if (detail?.editorNodeId !== nodeId) {
        return;
      }
      adapterRef.current?.refreshImageClozePresentation();
    };

    window.addEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, handlePresentationChange as EventListener);
    return () => {
      window.removeEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, handlePresentationChange as EventListener);
    };
  }, [adapterRef, nodeId]);
}
