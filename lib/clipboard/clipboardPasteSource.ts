export type ClipboardPasteSource =
  | { content: string; kind: 'internal'; reason: string }
  | { content: string; kind: 'plain-markdown'; reason: string }
  | { content: string; kind: 'plain-text'; reason: string }
  | { content: string; kind: 'rich-html'; reason: string };

export interface ClipboardPasteSourceInput {
  html?: string | null;
  internalText?: string | null;
  plainText?: string | null;
}

const RICH_HTML_STRUCTURE_PATTERN =
  /<(?:table|h[1-6]|ul|ol|blockquote|a\s+[^>]*href|img|strong|b|em|i)\b/i;
const SOURCE_HTML_MARKER_PATTERN =
  /(?:data-vscode|class=["'][^"']*vscode|white-space\s*:\s*pre|font-family\s*:[^;"']*(?:monospace|cascadia code|consolas|menlo|courier))/i;

function hasContent(value: string) {
  return value.trim().length > 0;
}

function splitTableRow(line: string) {
  const trimmed = line.trim();
  const withoutLeadingPipe = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutBoundaryPipes = withoutLeadingPipe.endsWith('|') ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe;
  return withoutBoundaryPipes.split('|').map((cell) => cell.trim());
}

function isTableDelimiterCell(cell: string) {
  return /^:?-{3,}:?$/.test(cell);
}

export function hasGfmTableBlock(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = splitTableRow(lines[index] ?? '');
    const delimiter = splitTableRow(lines[index + 1] ?? '');
    if (
      header.length >= 2 &&
      delimiter.length === header.length &&
      (lines[index] ?? '').includes('|') &&
      delimiter.every(isTableDelimiterCell)
    ) {
      return true;
    }
  }
  return false;
}

export function hasMarkdownBlockSignal(text: string) {
  return (
    hasGfmTableBlock(text) ||
    /^ {0,3}(?:```|~~~)/m.test(text) ||
    /^ {0,3}#{1,6}\s+\S/m.test(text) ||
    /^ {0,3}(?:[-*+]\s+\S|\d+\.\s+\S)/m.test(text) ||
    /^ {0,3}>\s?/m.test(text) ||
    /!?\[\[[^\]\n]+]]/.test(text)
  );
}

function countMarkdownInlineSignals(text: string) {
  return [
    /\*\*[^*\n]+?\*\*/.test(text),
    /`[^`\n]+`/.test(text),
    /!?\[[^\]\n]*]\([^)]+\)|!?\[[^\]\n]+]\[[^\]\n]+]/.test(text),
    /==[^=\n]+==/.test(text)
  ].filter(Boolean).length;
}

function hasMarkdownInlineCluster(text: string) {
  return text.includes('\n') && countMarkdownInlineSignals(text) >= 3;
}

export function isRichDocumentHtml(html: string) {
  return RICH_HTML_STRUCTURE_PATTERN.test(html);
}

function countHtmlTags(html: string, tagName: string) {
  return html.match(new RegExp(`<${tagName}\\b`, 'gi'))?.length ?? 0;
}

export function isSourcePresentationHtml(html: string) {
  if (!hasContent(html) || isRichDocumentHtml(html)) {
    return false;
  }
  return SOURCE_HTML_MARKER_PATTERN.test(html) || countHtmlTags(html, 'span') >= 5;
}

export function decideClipboardPasteSource(input: ClipboardPasteSourceInput): ClipboardPasteSource | null {
  const internalText = input.internalText ?? '';
  if (hasContent(internalText)) {
    return { content: internalText, kind: 'internal', reason: 'internal-mime' };
  }

  const plainText = input.plainText ?? '';
  const html = input.html ?? '';
  const hasPlainText = hasContent(plainText);
  const hasHtml = hasContent(html);

  if (!hasPlainText && !hasHtml) {
    return null;
  }
  if (!hasPlainText) {
    return { content: html, kind: 'rich-html', reason: 'html-only' };
  }
  if (!hasHtml) {
    return {
      content: plainText,
      kind: hasMarkdownBlockSignal(plainText) ? 'plain-markdown' : 'plain-text',
      reason: 'plain-only'
    };
  }

  if (isSourcePresentationHtml(html) && (hasMarkdownBlockSignal(plainText) || hasMarkdownInlineCluster(plainText))) {
    return { content: plainText, kind: 'plain-markdown', reason: 'source-html-with-markdown-plain' };
  }

  return { content: html, kind: 'rich-html', reason: 'rich-html-preferred' };
}
