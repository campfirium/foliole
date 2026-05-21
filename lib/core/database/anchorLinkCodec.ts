import { parseFormulaLocator, type FormulaStoredAnchorLocator } from './anchorLinkFormulaCodec';

export interface StoredAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    from?: number;
    height?: number;
    originalText?: string;
    page?: number;
    rects?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    to?: number;
    width?: number;
    x: number;
    y: number;
  } | FormulaStoredAnchorLocator | {
    ranges: Array<{
      from: number;
      originalText: string;
      to: number;
    }>;
  } | {
    from: number;
    originalText: string;
    to: number;
  };
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function asRectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rects = value
    .filter((rect): rect is { x: number; y: number; width: number; height: number } => {
      return (
        typeof rect === 'object' &&
        rect !== null &&
        typeof (rect as { x?: unknown }).x === 'number' &&
        Number.isFinite((rect as { x: number }).x) &&
        typeof (rect as { y?: unknown }).y === 'number' &&
        Number.isFinite((rect as { y: number }).y) &&
        typeof (rect as { width?: unknown }).width === 'number' &&
        Number.isFinite((rect as { width: number }).width) &&
        (rect as { width: number }).width > 0 &&
        typeof (rect as { height?: unknown }).height === 'number' &&
        Number.isFinite((rect as { height: number }).height) &&
        (rect as { height: number }).height > 0
      );
    })
    .map((rect) => ({
      height: clampRatio(rect.height),
      width: clampRatio(rect.width),
      x: clampRatio(rect.x),
      y: clampRatio(rect.y)
    }));
  return rects.length > 0 ? rects : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseTextLocator(
  locator:
    | {
      from?: unknown;
      originalText?: unknown;
      ranges?: unknown;
      to?: unknown;
    }
    | undefined
) {
  if (
    !locator ||
    !isFiniteNumber(locator.from) ||
    !Number.isInteger(locator.from) ||
    locator.from < 0 ||
    !isFiniteNumber(locator.to) ||
    !Number.isInteger(locator.to) ||
    locator.to < locator.from ||
    typeof locator.originalText !== 'string'
  ) {
    return undefined;
  }
  return {
    from: locator.from,
    originalText: locator.originalText,
    to: locator.to
  };
}

function parseTextLocatorGroup(
  locator:
    | {
      ranges?: unknown;
    }
    | undefined
) {
  if (!locator || !Array.isArray(locator.ranges) || locator.ranges.length < 2) {
    return undefined;
  }
  const ranges = locator.ranges
    .map((range) =>
      parseTextLocator(
        typeof range === 'object' && range !== null ? range as { from?: unknown; originalText?: unknown; to?: unknown } : undefined
      )
    )
    .filter((range): range is NonNullable<typeof range> => range !== undefined);
  if (ranges.length !== locator.ranges.length) {
    return undefined;
  }
  return { ranges };
}

function parseVisualLocator(
  locator:
    | {
        attachmentId?: unknown;
        height?: unknown;
        page?: unknown;
        rects?: unknown;
        width?: unknown;
        x?: unknown;
        y?: unknown;
      }
    | undefined
) {
  if (!locator || !isFiniteNumber(locator.x) || !isFiniteNumber(locator.y)) {
    return undefined;
  }
  if (
    typeof locator.attachmentId === 'string' &&
    locator.attachmentId.trim().length > 0 &&
    isFiniteNumber(locator.width) &&
    locator.width > 0 &&
    isFiniteNumber(locator.height) &&
    locator.height > 0
  ) {
    return {
      attachmentId: locator.attachmentId,
      height: clampRatio(locator.height),
      width: clampRatio(locator.width),
      x: clampRatio(locator.x),
      y: clampRatio(locator.y)
    };
  }
  if (isFiniteNumber(locator.page) && Number.isInteger(locator.page) && locator.page > 0) {
    const rects = asRectArray(locator.rects);
    return {
      page: locator.page,
      ...(rects === undefined ? {} : { rects }),
      x: clampRatio(locator.x),
      y: clampRatio(locator.y)
    };
  }
  return undefined;
}

export function parseStoredAnchorLink(value: string | null): StoredAnchorLink | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as {
      id?: unknown;
      kind?: unknown;
      locator?: {
        attachmentId?: unknown;
        from?: unknown;
        height?: unknown;
        originalText?: unknown;
        page?: unknown;
        ranges?: unknown;
        rects?: unknown;
        selection?: unknown;
        to?: unknown;
        width?: unknown;
        x?: unknown;
        y?: unknown;
      };
    };
    if (typeof parsed.id !== 'string') {
      return null;
    }
    if (parsed.kind !== 'highlight' && parsed.kind !== 'cloze') {
      return null;
    }
    const base: StoredAnchorLink = { id: parsed.id, kind: parsed.kind };
    const locator = parsed.locator;
    const textLocatorGroup = parseTextLocatorGroup(locator);
    if (textLocatorGroup) {
      base.locator = textLocatorGroup;
      return base;
    }
    const textLocator = parseTextLocator(locator);
    if (textLocator) {
      base.locator = textLocator;
      return base;
    }
    const formulaLocator = parseFormulaLocator(locator);
    if (formulaLocator) {
      base.locator = formulaLocator;
      return base;
    }
    const visualLocator = parseVisualLocator(locator);
    if (visualLocator) {
      base.locator = visualLocator;
    }
    return base;
  } catch {
    return null;
  }
}
