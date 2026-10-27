import { useMemo, useRef } from 'react';

import { collectDocumentTextAnchorDecorations } from '../../features/editor/model/documentTextAnchorDecorations';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { useDocumentPanelMarkerChildren } from './useDocumentPanelMarkerChildren';

export function useDocumentPanelTextAnchorState(props: DocumentPanelSectionProps) {
  const markerChildren = useDocumentPanelMarkerChildren(props.activeNodeId, props.nodesById);
  const previousDecorationsRef = useRef<ReturnType<typeof collectDocumentTextAnchorDecorations>>([]);
  return useMemo(() => {
    const nextDecorations = collectDocumentTextAnchorDecorations({
      activeNodeId: props.activeNodeId,
      nodesById: markerChildren,
      parentContent: props.editorContent,
      trashedNodeIds: props.trashedNodeIds
    });
    const previousDecorations = previousDecorationsRef.current;
    const isSame =
      previousDecorations.length === nextDecorations.length &&
      previousDecorations.every((previousDecoration, index) => {
        const nextDecoration = nextDecorations[index];
        return (
          previousDecoration?.from === nextDecoration?.from &&
          previousDecoration?.to === nextDecoration?.to &&
          previousDecoration?.kind === nextDecoration?.kind &&
          previousDecoration?.nodeId === nextDecoration?.nodeId
        );
      });
    if (isSame) {
      return previousDecorations;
    }
    previousDecorationsRef.current = nextDecorations;
    return nextDecorations;
  }, [props.activeNodeId, props.editorContent, markerChildren, props.trashedNodeIds]);
}
