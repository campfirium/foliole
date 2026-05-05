import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

import {
  markEditorContentSyncCompleted,
  markEditorContentSyncStarted
} from '../../../shared/platform/performanceDiagnosticsProbe';
import { IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT } from '../../image-cloze/model/imageClozePresentation';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorDiffDecorations, EditorViewportMode } from '../adapters/EditorAdapter';

import {
  useEditorSelectionRestoreExecution,
  useEditorSelectionRestorePreparation,
  useEditorSelectionRestoreRefs
} from './markdownEditorSelectionRestore';
import type { EditorViewState } from './markdownEditorTypes';

function useEditorContentSync(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  nodeId: string | null,
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
  }, [adapterRef, nodeId, value]);

  useEffect(() => {
    adapterRef.current?.setDiffDecorations(lineDiffDecorations ?? null);
  }, [adapterRef, lineDiffDecorations]);
}

export function useEditorLayoutEffects(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  readingTargetViewportMode: EditorViewportMode | null | undefined,
  readingTargetViewportRatio: number | null | undefined,
  nodeViewState: EditorViewState | undefined,
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string) => void) | undefined,
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined,
  _setReadingPositionSelection: ((selection: NonNullable<EditorViewState['selection']>) => void) | undefined,
  shouldSuppressSelectionRestore: (() => boolean) | undefined,
  value: string,
  lineDiffDecorations: EditorDiffDecorations | null | undefined
) {
  const restoreRefs = useEditorSelectionRestoreRefs();
  useEditorSelectionRestorePreparation({
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    nodeId,
    nodeViewState,
    readingSelection,
    readingTargetViewportMode,
    restoreRefs
  });
  useEditorContentSync(adapterRef, nodeId, value, lineDiffDecorations);
  useEditorSelectionRestoreExecution({
    adapterRef,
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    nodeId,
    nodeViewState,
    readingSelection,
    readingTargetViewportMode,
    readingTargetViewportRatio,
    restoreRefs,
    shouldSuppressSelectionRestore,
    value
  });
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
