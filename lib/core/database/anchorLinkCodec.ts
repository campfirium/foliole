export interface StoredAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    height?: number;
    page?: number;
    rects?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    width?: number;
    x: number;
    y: number;
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
        height?: unknown;
        page?: unknown;
        rects?: unknown;
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
    if (locator && typeof locator.x === 'number' && Number.isFinite(locator.x) && typeof locator.y === 'number' && Number.isFinite(locator.y)) {
      if (
        typeof locator.attachmentId === 'string' &&
        locator.attachmentId.trim().length > 0 &&
        typeof locator.width === 'number' &&
        Number.isFinite(locator.width) &&
        locator.width > 0 &&
        typeof locator.height === 'number' &&
        Number.isFinite(locator.height) &&
        locator.height > 0
      ) {
        base.locator = {
          attachmentId: locator.attachmentId,
          height: clampRatio(locator.height),
          width: clampRatio(locator.width),
          x: clampRatio(locator.x),
          y: clampRatio(locator.y)
        };
      } else if (typeof locator.page === 'number' && Number.isInteger(locator.page) && locator.page > 0) {
        base.locator = {
          page: locator.page,
          rects: asRectArray(locator.rects),
          x: clampRatio(locator.x),
          y: clampRatio(locator.y)
        };
      }
    }
    return base;
  } catch {
    return null;
  }
}
