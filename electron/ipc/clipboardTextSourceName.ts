const CLIPBOARD_SOURCE_PREVIEW_LIMIT = 48;

function stripMarkdownPreviewSyntax(content: string) {
  return content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')
    .replace(/^\s{0,3}[-*+]\s+/gm, ' ')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, ' ')
    .replace(/[*_~`>#|]+/g, ' ');
}

function truncateClipboardSourcePreview(value: string) {
  const chars = Array.from(value);
  if (chars.length <= CLIPBOARD_SOURCE_PREVIEW_LIMIT) {
    return value;
  }
  return `${chars.slice(0, CLIPBOARD_SOURCE_PREVIEW_LIMIT).join('').trimEnd()}...`;
}

export function resolveClipboardTextSourceName(content: string) {
  const preview = stripMarkdownPreviewSyntax(content).replace(/\s+/g, ' ').trim();
  return preview ? truncateClipboardSourcePreview(preview) : 'Clipboard import';
}
