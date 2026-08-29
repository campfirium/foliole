import { useEffect } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { registerPdfSystem, unregisterPdfSystem } from '../../features/pdf/model/pdfSystemRegistry';

export type PdfSelectionAnnotationKind = 'cloze' | 'highlight' | 'note';
export type PdfVisualSelectionKind = PdfSelectionAnnotationKind;

let activePdfSelectionAnnotationRequest: ((kind: PdfSelectionAnnotationKind) => boolean) | null = null;
const PDF_VISUAL_SELECTION_EVENT = 'foliole:pdf-visual-selection';

export function requestActivePdfSelectionAnnotation(kind: PdfSelectionAnnotationKind) {
  return activePdfSelectionAnnotationRequest?.(kind) ?? false;
}

export function setPdfVisualSelectionKind(kind: PdfVisualSelectionKind | null) {
  window.dispatchEvent(new CustomEvent(PDF_VISUAL_SELECTION_EVENT, { detail: kind }));
}

export function onPdfVisualSelectionKindChange(handler: (kind: PdfVisualSelectionKind | null) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<PdfVisualSelectionKind | null>).detail);
  window.addEventListener(PDF_VISUAL_SELECTION_EVENT, listener);
  return () => window.removeEventListener(PDF_VISUAL_SELECTION_EVENT, listener);
}

export function useRegisterPdfSurface(
  nodeId: string | null,
  requestAnchorJump: (locator: NonNullable<NodeAnchorLink['locator']>) => void,
  requestSearch: (request: { matchStart: number; page: number; query: string }) => void,
  requestSelectionAnnotation: (kind: PdfSelectionAnnotationKind) => boolean,
  isVisible: boolean
) {
  useEffect(() => {
    if (!nodeId) {
      return;
    }
    registerPdfSystem(nodeId, { requestAnchorJump, requestSearch });
    return () => {
      unregisterPdfSystem(nodeId);
    };
  }, [nodeId, requestAnchorJump, requestSearch]);
  useEffect(() => {
    if (!nodeId || !isVisible) return undefined;
    activePdfSelectionAnnotationRequest = requestSelectionAnnotation;
    return () => {
      if (activePdfSelectionAnnotationRequest === requestSelectionAnnotation) {
        activePdfSelectionAnnotationRequest = null;
      }
    };
  }, [isVisible, nodeId, requestSelectionAnnotation]);
}
