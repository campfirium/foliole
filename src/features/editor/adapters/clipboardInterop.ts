import type { EditorView } from '@codemirror/view';

import { parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { loadRuntimeLibraryPathSettings } from '../../../shared/platform/libraryPathsBridge';

import { collectSelectionTextWithExpandedLinks } from './liveMarkdownAnchors';

export const FOLIOLE_CLIPBOARD_MIME = 'application/x-foliole';

const ANCHOR_BLOCK_PATTERN = /<(highlight|cloze)\s+id="([1-9]\d*)">([\s\S]*?)<\/\1 id="\2">/g;
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)\s+id="[^"]+"\s*>/g;
const HIGHLIGHT_MARKER_PATTERN = /==([\s\S]+?)==/g;
const ASSET_URL_PATTERN = /asset:\/\/[^\s<>)\]]+/g;

let cachedAssetsDir: string | null | undefined;
let pendingAssetsDirLoad: Promise<string | null> | null = null;

export interface ClipboardExportPayload {
  externalHtml: string;
  externalText: string;
  internalText: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeFilePath(path: string) {
  const slashPath = path.replaceAll('\\', '/');
  return slashPath.startsWith('/') ? slashPath : `/${slashPath}`;
}

function toFileUrl(path: string) {
  return `file://${encodeURI(normalizeFilePath(path))}`;
}

function buildAssetFileUrl(assetUrl: string, assetsDir: string | null) {
  if (!assetsDir) {
    return assetUrl;
  }

  const attachmentId = parseAssetMarkdownUrl(assetUrl);
  if (!attachmentId) {
    return assetUrl;
  }

  const dotIndex = assetUrl.lastIndexOf('.');
  const extension = dotIndex > assetUrl.indexOf('://') ? assetUrl.slice(dotIndex) : '';
  return toFileUrl(`${assetsDir}/${attachmentId}${extension}`);
}

function replaceAssetUrls(value: string, assetsDir: string | null) {
  return value.replace(ASSET_URL_PATTERN, (assetUrl) => buildAssetFileUrl(assetUrl, assetsDir));
}

function convertAnchorsToExternalMarkdown(value: string): string {
  let converted = value;
  let previous = '';

  while (converted !== previous) {
    previous = converted;
    converted = converted.replace(ANCHOR_BLOCK_PATTERN, (_match, kind: string, _id: string, inner: string) => {
      const nestedContent = convertAnchorsToExternalMarkdown(inner);
      return kind === 'highlight' ? `==${nestedContent}==` : nestedContent;
    });
  }

  return converted.replace(ANCHOR_TAG_PATTERN, '');
}

function renderInlineHtml(value: string) {
  const placeholders = new Map<string, string>();
  let nextToken = 0;
  const withImages = value.replaceAll(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (_match, alt: string, src: string) => {
    const token = `__FOLIOLE_IMAGE_${nextToken}__`;
    nextToken += 1;
    placeholders.set(token, `<img alt="${escapeHtml(alt)}" src="${escapeHtml(src)}">`);
    return token;
  });

  let escaped = escapeHtml(withImages);
  placeholders.forEach((html, token) => {
    escaped = escaped.replace(token, html);
  });
  return escaped.replace(HIGHLIGHT_MARKER_PATTERN, '<mark>$1</mark>');
}

function convertExternalMarkdownToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return '';
      }
      if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) {
        return renderInlineHtml(trimmed);
      }
      return `<p>${renderInlineHtml(trimmed).replaceAll('\n', '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function collectSelectedMarkdown(view: EditorView) {
  const pieces = view.state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => view.state.doc.sliceString(range.from, range.to));
  return pieces.join('\n');
}

export function convertInternalMarkdownForExternal(value: string, assetsDir: string | null) {
  return replaceAssetUrls(convertAnchorsToExternalMarkdown(value), assetsDir);
}

export function createClipboardExportPayload(
  internalText: string,
  expandedText: string | null,
  assetsDir: string | null
): ClipboardExportPayload | null {
  const normalizedInternalText = internalText.trim().length > 0 ? internalText : '';
  if (!normalizedInternalText) {
    return null;
  }

  const externalBase = expandedText?.trim().length ? expandedText : normalizedInternalText;
  const externalText = convertInternalMarkdownForExternal(externalBase, assetsDir);
  return {
    internalText: normalizedInternalText,
    externalText,
    externalHtml: convertExternalMarkdownToHtml(externalText)
  };
}

export async function ensureClipboardAssetsDirLoaded() {
  if (cachedAssetsDir !== undefined) {
    return cachedAssetsDir;
  }
  if (!pendingAssetsDirLoad) {
    pendingAssetsDirLoad = loadRuntimeLibraryPathSettings()
      .then((settings) => settings?.assetsDir ?? null)
      .catch(() => null)
      .then((assetsDir) => {
        cachedAssetsDir = assetsDir;
        pendingAssetsDirLoad = null;
        return assetsDir;
      });
  }
  return pendingAssetsDirLoad;
}

export function createClipboardExportFromView(view: EditorView) {
  const internalText = collectSelectedMarkdown(view);
  if (!internalText) {
    return null;
  }
  return createClipboardExportPayload(internalText, collectSelectionTextWithExpandedLinks(view), cachedAssetsDir ?? null);
}

export function resetClipboardInteropStateForTests() {
  cachedAssetsDir = undefined;
  pendingAssetsDirLoad = null;
}

void ensureClipboardAssetsDirLoaded();
