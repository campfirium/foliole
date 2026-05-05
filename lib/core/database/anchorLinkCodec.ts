export interface StoredAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    page: number;
    x: number;
    y: number;
  };
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function parseStoredAnchorLink(value: string | null): StoredAnchorLink | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as {
      id?: unknown;
      kind?: unknown;
      locator?: { page?: unknown; x?: unknown; y?: unknown };
    };
    if (typeof parsed.id !== 'string') {
      return null;
    }
    if (parsed.kind !== 'highlight' && parsed.kind !== 'cloze') {
      return null;
    }
    const base: StoredAnchorLink = { id: parsed.id, kind: parsed.kind };
    const locator = parsed.locator;
    if (
      locator &&
      typeof locator.page === 'number' &&
      Number.isInteger(locator.page) &&
      locator.page > 0 &&
      typeof locator.x === 'number' &&
      Number.isFinite(locator.x) &&
      typeof locator.y === 'number' &&
      Number.isFinite(locator.y)
    ) {
      base.locator = {
        page: locator.page,
        x: clampRatio(locator.x),
        y: clampRatio(locator.y)
      };
    }
    return base;
  } catch {
    return null;
  }
}
