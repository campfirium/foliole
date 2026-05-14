import { useEffect, useLayoutEffect } from 'react';

import {
  markDocumentPanelBound,
  markNodeBodyPainted,
  markNodeBodyReady
} from '../../shared/platform/performanceDiagnosticsProbe';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

export function useDocumentPanelPerformanceMarkers(
  props: DocumentPanelSectionProps,
  isEmptyState: boolean,
  isEditorDocumentLoaded: boolean
) {
  useLayoutEffect(() => {
    if (!props.editorNodeId || isEmptyState) {
      return;
    }
    markDocumentPanelBound(props.editorNodeId, `content:${props.editorContent.length}`);
  }, [isEmptyState, props.editorContent.length, props.editorNodeId]);

  useEffect(() => {
    const editorNodeId = props.editorNodeId;
    if (!editorNodeId || isEmptyState || !isEditorDocumentLoaded) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      markNodeBodyPainted(editorNodeId);
      window.requestAnimationFrame(() => {
        markNodeBodyReady(editorNodeId);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isEditorDocumentLoaded, isEmptyState, props.editorContent, props.editorNodeId]);
}
