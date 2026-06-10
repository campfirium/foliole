import {
  DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX,
  formatHighlightCardContent
} from '../../lib/core/annotations/textAnnotationContent';

interface SelectionAnnotationTextLocator {
  from: number;
  originalText: string;
  to: number;
}

export interface SelectionAnnotationPayload {
  anchorId: string;
  clozeContent: string;
  entries: Array<{ locator: SelectionAnnotationTextLocator }>;
  imageRegions?: Array<{
    attachmentId: string;
    regions: Array<{ height: number; id: string; width: number; x: number; y: number }>;
  }> | null;
  parentNodeId: string;
  selectionText: string;
}

export interface SelectionAnnotationAnchorLink {
  id: string;
  kind: 'cloze' | 'highlight';
  locator: SelectionAnnotationTextLocator | { ranges: SelectionAnnotationTextLocator[] };
}

export function createSelectionAnnotationAnchorLink(
  payload: SelectionAnnotationPayload,
  kind: 'cloze' | 'highlight'
): SelectionAnnotationAnchorLink | undefined {
  const locators = payload.entries.map((entry) => entry.locator).filter(Boolean);
  if (locators.length === 0) {
    return undefined;
  }
  return {
    id: payload.anchorId,
    kind,
    locator: locators.length === 1 ? locators[0]! : { ranges: locators }
  };
}

export function createSelectionHighlightContent(payload: SelectionAnnotationPayload) {
  return payload.selectionText.trim();
}

export function createSelectionAnnotatedHighlightContent(
  payload: SelectionAnnotationPayload,
  note?: string,
  notePrefix = DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX
) {
  return formatHighlightCardContent({
    ...(note !== undefined ? { note } : {}),
    notePrefix,
    text: payload.selectionText
  });
}

export function createSelectionClozeDraft(payload: SelectionAnnotationPayload) {
  return {
    answer: payload.selectionText.trim(),
    prompt: payload.clozeContent.trim()
  };
}

export function getSelectionClozeFrontLength(payload: Pick<SelectionAnnotationPayload, 'clozeContent'>) {
  return payload.clozeContent.trim().length;
}

export function shouldGuardLongSelectionClozeFront(
  payload: Pick<SelectionAnnotationPayload, 'clozeContent'>,
  threshold: number
) {
  return getSelectionClozeFrontLength(payload) > threshold;
}
