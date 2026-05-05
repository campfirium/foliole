import { stripAnchorBlocks } from './anchorBlocks.js';

const ANCHOR_BLOCK_PATTERN = /<(highlight|cloze)\s+id="([^"]+)">([\s\S]*?)<\/\1 id="\2">/g;

export interface ExternalAnchorRange {
  from: number;
  kind: 'highlight' | 'cloze';
  to: number;
}

function renderExternalAnchorOpen(kind: 'highlight' | 'cloze') {
  return kind === 'highlight' ? '==' : '<u>';
}

function renderExternalAnchorClose(kind: 'highlight' | 'cloze') {
  return kind === 'highlight' ? '==' : '</u>';
}

export function convertAnchoredMarkdownToExternal(value: string): string {
  let converted = value;
  let previous = '';

  while (converted !== previous) {
    previous = converted;
    converted = converted.replace(ANCHOR_BLOCK_PATTERN, (_match, kind: string, _id: string, inner: string) => {
      const nestedContent = convertAnchoredMarkdownToExternal(inner);
      return kind === 'highlight' ? `==${nestedContent}==` : `<u>${nestedContent}</u>`;
    });
  }

  return stripAnchorBlocks(converted);
}

export function renderExternalMarkdownWithAnchorRanges(
  visibleText: string,
  anchors: ReadonlyArray<ExternalAnchorRange>
) {
  if (anchors.length === 0 || visibleText.length === 0) {
    return visibleText;
  }

  const openings = new Map<number, ExternalAnchorRange[]>();
  const closings = new Map<number, ExternalAnchorRange[]>();
  for (const anchor of anchors) {
    if (anchor.to <= anchor.from || anchor.from < 0 || anchor.to > visibleText.length) {
      continue;
    }
    const starts = openings.get(anchor.from) ?? [];
    starts.push(anchor);
    openings.set(anchor.from, starts);

    const ends = closings.get(anchor.to) ?? [];
    ends.push(anchor);
    closings.set(anchor.to, ends);
  }

  const parts: string[] = [];
  for (let position = 0; position <= visibleText.length; position += 1) {
    const ending = closings.get(position);
    if (ending) {
      ending
        .sort((left, right) => {
          if (left.to !== right.to) {
            return left.to - right.to;
          }
          return right.from - left.from;
        })
        .forEach((anchor) => parts.push(renderExternalAnchorClose(anchor.kind)));
    }

    const starting = openings.get(position);
    if (starting) {
      starting
        .sort((left, right) => {
          if (left.from !== right.from) {
            return left.from - right.from;
          }
          return right.to - left.to;
        })
        .forEach((anchor) => parts.push(renderExternalAnchorOpen(anchor.kind)));
    }

    if (position < visibleText.length) {
      parts.push(visibleText[position]);
    }
  }

  return parts.join('');
}
