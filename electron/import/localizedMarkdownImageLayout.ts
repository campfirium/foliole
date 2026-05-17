import type { ImageIntrinsicSize } from './imageIntrinsicSize.js';

interface MarkdownImageRange {
  from: number;
  to: number;
}

export interface LocalizedImageLayoutResult {
  before: string;
  cursor: number;
  image: string;
}

const LARGE_IMAGE_MIN_WIDTH = 320;

function isLargeImage(size: ImageIntrinsicSize | null) {
  return size !== null && size.width >= LARGE_IMAGE_MIN_WIDTH;
}

function findLineStart(text: string, index: number) {
  return text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

function findLineEnd(text: string, index: number) {
  const lineEnd = text.indexOf('\n', index);
  return lineEnd >= 0 ? lineEnd : text.length;
}

function consumeInlineWhitespace(text: string, index: number) {
  let cursor = index;
  while (text[cursor] === ' ' || text[cursor] === '\t') {
    cursor += 1;
  }
  return cursor;
}

export function layoutLocalizedMarkdownImage(input: {
  imageMarkdown: string;
  markdown: string;
  range: MarkdownImageRange;
  size: ImageIntrinsicSize | null;
  textBeforeImage: string;
}): LocalizedImageLayoutResult {
  if (!isLargeImage(input.size)) {
    return { before: input.textBeforeImage, cursor: input.range.to, image: input.imageMarkdown };
  }

  const lineStart = findLineStart(input.markdown, input.range.from);
  const lineEnd = findLineEnd(input.markdown, input.range.to);
  const beforeOnLine = input.markdown.slice(lineStart, input.range.from);
  const afterOnLine = input.markdown.slice(input.range.to, lineEnd);
  const hasTextBefore = beforeOnLine.trim().length > 0;
  const hasTextAfter = afterOnLine.trim().length > 0;
  if (!hasTextBefore && !hasTextAfter) {
    return { before: input.textBeforeImage, cursor: input.range.to, image: input.imageMarkdown };
  }

  const before = hasTextBefore ? `${input.textBeforeImage.replace(/[ \t]+$/u, '')}\n\n` : input.textBeforeImage;
  const image = hasTextAfter ? `${input.imageMarkdown}\n\n` : input.imageMarkdown;
  const cursor = hasTextAfter ? consumeInlineWhitespace(input.markdown, input.range.to) : input.range.to;
  return { before, cursor, image };
}
