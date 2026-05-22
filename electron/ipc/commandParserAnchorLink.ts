import { parseFormulaLocator, type FormulaStoredAnchorLocator } from '../../lib/core/database/anchorLinkFormulaCodec.js';

import { parseAnchorLinkLocatorRects } from './anchorLinkLocatorRects.js';

interface AnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    from?: number;
    height?: number;
    originalText?: string;
    page?: number;
    rects?: Array<{
      height: number;
      width: number;
      x: number;
      y: number;
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

interface RawAnchorLocator {
  attachmentId?: unknown;
  display?: unknown;
  fallbackRect?: unknown;
  formulaSource?: unknown;
  from?: unknown;
  height?: unknown;
  kind?: unknown;
  occurrenceKey?: unknown;
  originalText?: unknown;
  page?: unknown;
  ranges?: unknown;
  rects?: unknown;
  selection?: unknown;
  to?: unknown;
  width?: unknown;
  x?: unknown;
  y?: unknown;
}

function parseTextAnchorLocator(locator: RawAnchorLocator, field: string) {
  if (typeof locator.from !== 'number' || !Number.isInteger(locator.from) || locator.from < 0) {
    throw new Error(`invalid argument: ${field}.locator.from`);
  }
  if (typeof locator.to !== 'number' || !Number.isInteger(locator.to) || locator.to < locator.from) {
    throw new Error(`invalid argument: ${field}.locator.to`);
  }
  if (typeof locator.originalText !== 'string') {
    throw new Error(`invalid argument: ${field}.locator.originalText`);
  }
  return { from: locator.from, originalText: locator.originalText, to: locator.to };
}

function parseTextAnchorLocatorGroup(locator: RawAnchorLocator, field: string) {
  if (!Array.isArray(locator.ranges) || locator.ranges.length < 2) {
    throw new Error(`invalid argument: ${field}.locator.ranges`);
  }
  return {
    ranges: locator.ranges.map((range, index) => {
      if (!range || typeof range !== 'object' || Array.isArray(range)) {
        throw new Error(`invalid argument: ${field}.locator.ranges[${index}]`);
      }
      return parseTextAnchorLocator(range as RawAnchorLocator, `${field}.locator.ranges[${index}]`);
    })
  };
}

function parseImageAnchorLocator(locator: RawAnchorLocator, field: string) {
  if (typeof locator.width !== 'number' || !Number.isFinite(locator.width) || locator.width <= 0) {
    throw new Error(`invalid argument: ${field}.locator.width`);
  }
  if (typeof locator.height !== 'number' || !Number.isFinite(locator.height) || locator.height <= 0) {
    throw new Error(`invalid argument: ${field}.locator.height`);
  }
  return {
    attachmentId: locator.attachmentId as string,
    height: Math.max(0, Math.min(1, locator.height)),
    width: Math.max(0, Math.min(1, locator.width)),
    x: Math.max(0, Math.min(1, locator.x as number)),
    y: Math.max(0, Math.min(1, locator.y as number))
  };
}

function parsePdfAnchorLocator(locator: RawAnchorLocator, field: string) {
  if (typeof locator.page !== 'number' || !Number.isInteger(locator.page) || locator.page < 1) {
    throw new Error(`invalid argument: ${field}.locator.page`);
  }
  const rects = parseAnchorLinkLocatorRects(locator.rects, `${field}.locator.rects`);
  return {
    page: locator.page,
    ...(rects === undefined ? {} : { rects }),
    x: Math.max(0, Math.min(1, locator.x as number)),
    y: Math.max(0, Math.min(1, locator.y as number))
  };
}

function parseFormulaAnchorLocator(locator: RawAnchorLocator, field: string) {
  const formulaLocator = parseFormulaLocator(locator);
  if (!formulaLocator) {
    throw new Error(`invalid argument: ${field}.locator`);
  }
  return formulaLocator;
}

export function asAnchorLink(value: unknown, field: string): AnchorLinkPayload | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid argument: ${field}`);
  const payload = value as { id?: unknown; kind?: unknown; locator?: RawAnchorLocator };
  if (typeof payload.id !== 'string') throw new Error(`invalid argument: ${field}.id`);
  if (payload.kind !== 'highlight' && payload.kind !== 'cloze') throw new Error(`invalid argument: ${field}.kind`);
  const anchorLink: AnchorLinkPayload = { id: payload.id, kind: payload.kind };
  if (payload.locator === undefined) return anchorLink;
  const locator = payload.locator;
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) throw new Error(`invalid argument: ${field}.locator`);
  if (Array.isArray(locator.ranges)) return { ...anchorLink, locator: parseTextAnchorLocatorGroup(locator, field) };
  if (typeof locator.from === 'number' || typeof locator.to === 'number' || typeof locator.originalText === 'string') {
    return { ...anchorLink, locator: parseTextAnchorLocator(locator, field) };
  }
  if (locator.kind === 'formula-region') return { ...anchorLink, locator: parseFormulaAnchorLocator(locator, field) };
  if (typeof locator.x !== 'number' || !Number.isFinite(locator.x)) throw new Error(`invalid argument: ${field}.locator.x`);
  if (typeof locator.y !== 'number' || !Number.isFinite(locator.y)) throw new Error(`invalid argument: ${field}.locator.y`);
  return {
    ...anchorLink,
    locator: typeof locator.attachmentId === 'string' && locator.attachmentId.trim().length > 0
      ? parseImageAnchorLocator(locator, field)
      : parsePdfAnchorLocator(locator, field)
  };
}
