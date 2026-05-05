import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

const STORAGE_KEYS = {
  primarySvg: APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
  secondarySvg: APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg,
  reviewVariantMode: APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode
} as const;

export type NodeIconReviewVariantMode = 'svg' | 'flip-x' | 'flip-y';

export const DEFAULT_NODE_ICON_REVIEW_VARIANT_MODE: NodeIconReviewVariantMode = 'flip-y';

interface NodeTreeRowCustomIconResult {
  markup: string | null;
  slot: 'primary' | 'secondary' | null;
  transformMode: 'none' | 'flip-x' | 'flip-y';
}

export function normalizeNodeIconReviewVariantMode(
  value: string | null,
  hasSecondarySvg: boolean
): NodeIconReviewVariantMode {
  if (value === 'svg' || value === 'flip-x' || value === 'flip-y') {
    return value;
  }
  return hasSecondarySvg ? 'svg' : DEFAULT_NODE_ICON_REVIEW_VARIANT_MODE;
}

function sanitizeSvgMarkup(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/<svg\b[\s\S]*<\/svg>/i);
  if (!match) {
    return null;
  }

  const sanitized = match[0]
    .replace(/<\?(xml|XML)[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\s+on[a-z-]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z-]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+(href|xlink:href)\s*=\s*"(javascript:[^"]*)"/gi, '')
    .replace(/\s+(href|xlink:href)\s*=\s*'(javascript:[^']*)'/gi, '')
    .replace(/\s(fill|stroke)\s*=\s*"(?!(none|currentColor|transparent)\b)[^"]*"/gi, ' $1="currentColor"')
    .replace(/\s(fill|stroke)\s*=\s*'(?!(none|currentColor|transparent)\b)[^']*'/gi, ' $1="currentColor"');

  return sanitized.length <= 12000 ? sanitized : null;
}

function escapeSvgAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function injectSvgAttributes(svgMarkup: string, attributes: Record<string, string | undefined>) {
  return svgMarkup.replace(/<svg\b([^>]*)>/i, (_, attrs: string) => {
    const nextAttributes = Object.entries(attributes)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
      .map(([key, value]) => `${key}="${escapeSvgAttribute(value)}"`)
      .join(' ');
    return `<svg${attrs} ${nextAttributes}>`;
  });
}

export function resolveNodeTreeRowCustomIcon(args: {
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
}): NodeTreeRowCustomIconResult {
  const primarySvg = sanitizeSvgMarkup(getWhitelistedLocalStorageItem(STORAGE_KEYS.primarySvg));
  const secondarySvg = sanitizeSvgMarkup(getWhitelistedLocalStorageItem(STORAGE_KEYS.secondarySvg));
  const reviewVariantMode = normalizeNodeIconReviewVariantMode(
    getWhitelistedLocalStorageItem(STORAGE_KEYS.reviewVariantMode),
    Boolean(secondarySvg)
  );
  const usesSecondarySvg = args.kind === 'review' && reviewVariantMode === 'svg' && Boolean(secondarySvg);
  const markup = usesSecondarySvg ? secondarySvg : primarySvg;
  const transformMode =
    args.kind !== 'review' ? 'none' : usesSecondarySvg ? 'none' : reviewVariantMode === 'svg' ? 'flip-y' : reviewVariantMode;

  if (!markup) {
    return { markup: null, slot: null, transformMode: 'none' };
  }

  return {
    markup: injectSvgAttributes(markup, {
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'xMidYMid meet',
      width: '100%',
      height: '100%',
      'data-node-custom-svg': 'true',
      'data-node-custom-slot': usesSecondarySvg ? 'secondary' : 'primary'
    }),
    slot: usesSecondarySvg ? 'secondary' : 'primary',
    transformMode
  };
}
