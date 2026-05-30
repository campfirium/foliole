import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

const STORAGE_KEYS = {
  primaryIcon: APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryLucideIcon,
  primarySvg: APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
  secondaryIcon: APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryLucideIcon,
  secondarySvg: APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg
} as const;

const SVG_MIME_TYPE = 'image/svg+xml';
const MAX_SVG_MARKUP_LENGTH = 12000;
const ALLOWED_SVG_ELEMENTS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);
const COMMON_SVG_ATTRIBUTES = new Set([
  'aria-hidden',
  'class',
  'clip-rule',
  'fill',
  'fill-opacity',
  'fill-rule',
  'focusable',
  'height',
  'opacity',
  'preserveAspectRatio',
  'role',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'style',
  'transform',
  'viewBox',
  'width',
  'xmlns'
]);
const SHAPE_SVG_ATTRIBUTES = new Set(['cx', 'cy', 'd', 'points', 'r', 'rx', 'ry', 'x', 'x1', 'x2', 'y', 'y1', 'y2']);
const CURRENT_COLOR_ATTRIBUTES = new Set(['fill', 'stroke']);
const SAFE_PAINT_VALUES = new Set(['none', 'currentColor', 'transparent']);

interface NodeTreeRowCustomIconResult {
  iconId: string | null;
  markup: string | null;
  slot: 'primary' | 'secondary' | 'state' | null;
  transformMode: 'none' | 'flip-x' | 'flip-y';
}

function sanitizeSvgMarkup(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsedSvg = parseSvgDocument(value.trim());
  if (!parsedSvg) {
    return null;
  }

  const sanitizedSvg = cloneAllowedSvgElement(parsedSvg.documentElement, parsedSvg);
  if (!sanitizedSvg || sanitizedSvg.localName !== 'svg') {
    return null;
  }

  const sanitized = new XMLSerializer().serializeToString(sanitizedSvg);
  return sanitized.length <= MAX_SVG_MARKUP_LENGTH ? sanitized : null;
}

function injectSvgAttributes(svgMarkup: string, attributes: Record<string, string | undefined>) {
  const parsedSvg = parseSvgDocument(svgMarkup);
  if (!parsedSvg) {
    return svgMarkup;
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string' && value.length > 0) {
      parsedSvg.documentElement.setAttribute(key, value);
    }
  }
  return new XMLSerializer().serializeToString(parsedSvg.documentElement);
}

function parseSvgDocument(markup: string): Document | null {
  if (markup.length > MAX_SVG_MARKUP_LENGTH) {
    return null;
  }
  const parsedSvg = new DOMParser().parseFromString(markup, SVG_MIME_TYPE);
  if (parsedSvg.querySelector('parsererror') || parsedSvg.documentElement.localName !== 'svg') {
    return null;
  }
  return parsedSvg;
}

function cloneAllowedSvgElement(source: Element, ownerDocument: Document): Element | null {
  if (!ALLOWED_SVG_ELEMENTS.has(source.localName)) {
    return null;
  }
  const cloned = ownerDocument.createElementNS(source.namespaceURI, source.localName);
  copyAllowedAttributes(source, cloned);
  for (const child of Array.from(source.children)) {
    const clonedChild = cloneAllowedSvgElement(child, ownerDocument);
    if (clonedChild) {
      cloned.appendChild(clonedChild);
    }
  }
  return cloned;
}

function copyAllowedAttributes(source: Element, target: Element) {
  for (const attribute of Array.from(source.attributes)) {
    const normalizedName = attribute.name;
    if (!isAllowedSvgAttribute(source.localName, normalizedName) || !isSafeSvgAttributeValue(normalizedName, attribute.value)) {
      continue;
    }
    target.setAttribute(normalizedName, normalizeSvgAttributeValue(normalizedName, attribute.value));
  }
}

function isAllowedSvgAttribute(elementName: string, attributeName: string) {
  if (COMMON_SVG_ATTRIBUTES.has(attributeName)) {
    return true;
  }
  return elementName !== 'svg' && SHAPE_SVG_ATTRIBUTES.has(attributeName);
}

function isSafeSvgAttributeValue(attributeName: string, value: string) {
  const normalizedValue = value.trim();
  if (normalizedValue.includes('<') || normalizedValue.includes('>') || hasControlCharacter(normalizedValue)) {
    return false;
  }
  if (attributeName === 'style') {
    return normalizedValue.length === 0;
  }
  return !normalizedValue.toLowerCase().includes('url(') && !normalizedValue.toLowerCase().includes('javascript:');
}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32;
  });
}

function normalizeSvgAttributeValue(attributeName: string, value: string) {
  if (!CURRENT_COLOR_ATTRIBUTES.has(attributeName)) {
    return value.trim();
  }
  return SAFE_PAINT_VALUES.has(value.trim()) ? value.trim() : 'currentColor';
}

export function resolveNodeTreeRowCustomIcon(args: {
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
}): NodeTreeRowCustomIconResult {
  const primarySvg = sanitizeSvgMarkup(getWhitelistedLocalStorageItem(STORAGE_KEYS.primarySvg));
  const secondarySvg = sanitizeSvgMarkup(getWhitelistedLocalStorageItem(STORAGE_KEYS.secondarySvg));
  const primaryIcon = getWhitelistedLocalStorageItem(STORAGE_KEYS.primaryIcon);
  const secondaryIcon = getWhitelistedLocalStorageItem(STORAGE_KEYS.secondaryIcon);
  const usesReview = args.kind === 'review';
  const markup = usesReview ? secondarySvg : primarySvg;
  const iconId = !markup ? (usesReview ? secondaryIcon : primaryIcon) : null;
  const slot = usesReview ? 'secondary' : 'primary';

  if (!markup && !iconId) {
    return { iconId: null, markup: null, slot: null, transformMode: 'none' };
  }

  if (!markup) {
    return { iconId, markup: null, slot, transformMode: 'none' };
  }

  return {
    iconId: null,
    markup: injectSvgAttributes(markup, {
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'xMidYMid meet',
      width: '100%',
      height: '100%',
      'data-node-custom-svg': 'true',
      'data-node-custom-slot': slot
    }),
    slot,
    transformMode: 'none'
  };
}

export function resolveNodeTreeRowIconSource(args: {
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
  iconId?: string;
  svg?: string;
}): NodeTreeRowCustomIconResult {
  const stateSvg = sanitizeSvgMarkup(args.svg ?? null);
  if (stateSvg) {
    return {
      iconId: null,
      markup: injectSvgAttributes(stateSvg, {
        'aria-hidden': 'true',
        focusable: 'false',
        preserveAspectRatio: 'xMidYMid meet',
        width: '100%',
        height: '100%',
        'data-node-custom-svg': 'true',
        'data-node-custom-slot': 'state'
      }),
      slot: 'state',
      transformMode: 'none'
    };
  }
  if (args.iconId) {
    return {
      iconId: args.iconId,
      markup: null,
      slot: 'state',
      transformMode: 'none'
    };
  }
  return resolveNodeTreeRowCustomIcon(args);
}
