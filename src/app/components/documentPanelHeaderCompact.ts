const DEFAULT_DOCUMENT_MAX_WIDTH = 860;
const DEFAULT_SIDE_SAFE_INLINE_START = 80;
const ROOT_FONT_SIZE_FALLBACK = 16;

export interface DocumentHeaderCompactInput {
  containerWidth: number;
  documentMaxWidth: number;
  sideSafeInlineStart: number;
}

export function parseCssLength(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const numericValue = Number.parseFloat(trimmed);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  if (trimmed.endsWith('rem')) {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return numericValue * (Number.isFinite(rootFontSize) ? rootFontSize : ROOT_FONT_SIZE_FALLBACK);
  }
  return numericValue;
}

export function resolveDocumentHeaderCompactMode({
  containerWidth,
  documentMaxWidth,
  sideSafeInlineStart
}: DocumentHeaderCompactInput): boolean {
  if (containerWidth <= 0) {
    return false;
  }
  return containerWidth <= documentMaxWidth + sideSafeInlineStart * 2;
}

export function readDocumentHeaderCompactInput(element: HTMLElement): DocumentHeaderCompactInput {
  const style = getComputedStyle(element);
  return {
    containerWidth: element.getBoundingClientRect().width,
    documentMaxWidth: parseCssLength(
      style.getPropertyValue('--document-max-width'),
      DEFAULT_DOCUMENT_MAX_WIDTH
    ),
    sideSafeInlineStart: parseCssLength(
      style.getPropertyValue('--document-header-navigation-safe-inline-start'),
      DEFAULT_SIDE_SAFE_INLINE_START
    )
  };
}
