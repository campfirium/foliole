import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences.js';

import type { ClipboardAnchorRange } from './anchorClipboardPayload.js';

const HIGHLIGHT_MARKER_PATTERN = /==([\s\S]+?)==/g;

export interface ClipboardExportPayload {
  externalHtml: string;
  externalText: string;
  internalAnchors: ClipboardAnchorRange[];
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

function buildAssetFileUrl(assetUrl: string, assetsDir: string | null, parseAssetUrl: (assetUrl: string) => string | null) {
  if (!assetsDir) {
    return assetUrl;
  }

  const attachmentId = parseAssetUrl(assetUrl);
  if (!attachmentId) {
    return assetUrl;
  }

  const dotIndex = assetUrl.lastIndexOf('.');
  const extension = dotIndex > assetUrl.indexOf('://') ? assetUrl.slice(dotIndex) : '';
  return toFileUrl(`${assetsDir}/${attachmentId}${extension}`);
}

function replaceAssetUrls(
  value: string,
  assetsDir: string | null,
  parseAssetUrl: (assetUrl: string) => string | null
) {
  return replaceMarkdownImageReferences(value, (alt, src, suffix) => {
    const nextSource = buildAssetFileUrl(src, assetsDir, parseAssetUrl);
    const suffixText = suffix ? ` ${suffix}` : '';
    return `![${alt}](${nextSource}${suffixText})`;
  });
}

function renderInlineHtml(value: string) {
  const placeholders = new Map<string, string>();
  let nextToken = 0;
  const withImages = replaceMarkdownImageReferences(value, (alt, src) => {
    const token = `__FOLIOLE_IMAGE_${nextToken}__`;
    nextToken += 1;
    placeholders.set(token, `<img alt="${escapeHtml(alt)}" src="${escapeHtml(src)}">`);
    return token;
  });
  const withUnderline = withImages.replaceAll(/<u>([\s\S]*?)<\/u>/g, (_match, text: string) => {
    const token = `__FOLIOLE_UNDERLINE_${nextToken}__`;
    nextToken += 1;
    placeholders.set(token, `<u>${escapeHtml(text)}</u>`);
    return token;
  });

  let escaped = escapeHtml(withUnderline);
  placeholders.forEach((html, token) => {
    escaped = escaped.replace(token, html);
  });
  return escaped.replace(HIGHLIGHT_MARKER_PATTERN, '<mark>$1</mark>');
}

function replaceMarkdownImageReferences(
  value: string,
  replacement: (alt: string, src: string, suffix: string) => string
) {
  const matches = collectMarkdownImageReferences(value);
  if (matches.length === 0) {
    return value;
  }

  let nextValue = '';
  let cursor = 0;
  for (const match of matches) {
    const target = parseMarkdownImageTarget(match.rawTarget);
    if (!target) {
      continue;
    }
    nextValue += value.slice(cursor, match.start);
    nextValue += replacement(match.altText, target.destination, target.suffix);
    cursor = match.end;
  }
  return `${nextValue}${value.slice(cursor)}`;
}

function isStandaloneMarkdownImageBlock(value: string) {
  const matches = collectMarkdownImageReferences(value);
  return matches.length === 1 && matches[0]?.start === 0 && matches[0].end === value.length;
}

function convertExternalMarkdownToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return '';
      }
      if (isStandaloneMarkdownImageBlock(trimmed)) {
        return renderInlineHtml(trimmed);
      }
      return `<p>${renderInlineHtml(trimmed).replaceAll('\n', '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

export function convertInternalMarkdownForExternal(
  value: string,
  assetsDir: string | null,
  parseAssetUrl: (assetUrl: string) => string | null
) {
  return replaceAssetUrls(value, assetsDir, parseAssetUrl);
}

export function createClipboardExportPayload(input: {
  assetsDir: string | null;
  externalTextBase: string | null;
  internalAnchors?: ClipboardAnchorRange[];
  internalText: string;
  parseAssetUrl: (assetUrl: string) => string | null;
}): ClipboardExportPayload | null {
  const normalizedInternalText = input.internalText.trim().length > 0 ? input.internalText : '';
  if (!normalizedInternalText) {
    return null;
  }

  const externalBase = input.externalTextBase?.trim().length ? input.externalTextBase : input.internalText;
  const externalText = convertInternalMarkdownForExternal(externalBase, input.assetsDir, input.parseAssetUrl);
  return {
    internalAnchors: input.internalAnchors ?? [],
    internalText: normalizedInternalText,
    externalText,
    externalHtml: convertExternalMarkdownToHtml(externalText)
  };
}
