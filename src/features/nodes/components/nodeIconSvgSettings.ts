import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

const STORAGE_KEYS = {
  primarySvg: APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
  secondarySvg: APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg
} as const;

interface NodeTreeRowCustomIconResult {
  markup: string | null;
  slot: 'primary' | 'secondary' | null;
  usesMirrorFallback: boolean;
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
  const usesSecondarySvg = args.kind === 'review' && Boolean(secondarySvg);
  const markup = usesSecondarySvg ? secondarySvg : primarySvg;

  if (!markup) {
    return { markup: null, slot: null, usesMirrorFallback: false };
  }

  return {
    markup: injectSvgAttributes(markup, {
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'xMidYMid meet',
      width: '100%',
      height: '100%',
      'data-node-custom-svg': 'true',
      'data-node-custom-slot': usesSecondarySvg ? 'secondary' : 'primary',
      'stroke-dasharray': args.state === 'queued' ? '2.2 1.4' : undefined
    }),
    slot: usesSecondarySvg ? 'secondary' : 'primary',
    usesMirrorFallback: args.kind === 'review' && !usesSecondarySvg
  };
}
