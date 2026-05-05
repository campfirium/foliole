export interface DocumentOutlineItem {
  from: number;
  level: number;
  text: string;
  to: number;
}

const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;
const HEADING_PATTERN = /^\s{0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/;
const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractDocumentOutline(content: string): DocumentOutlineItem[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const items: DocumentOutlineItem[] = [];
  let offset = 0;
  let activeFence: '```' | '~~~' | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[1] as '```' | '~~~';
      activeFence = activeFence === marker ? null : marker;
    } else if (!activeFence) {
      const sanitizedLine = line.replace(ANCHOR_TAG_PATTERN, '');
      const sanitizedMatch = sanitizedLine.match(HEADING_PATTERN);
      const directMatch = line.match(HEADING_PATTERN);

      if (directMatch || sanitizedMatch) {
        const sourceLine = sanitizedMatch ? sanitizedLine : line;
        const sourceMatch = sanitizedMatch ?? directMatch;
        const text = stripInlineMarkdown(sourceMatch?.[2] ?? '');
        const headingPrefixLength = (sourceMatch?.[1]?.length ?? 0) + 1;
        const headingStartInSanitized = sourceLine.search(/\S|$/) + headingPrefixLength;
        const headingStart = offset + mapSanitizedIndexToOriginal(line, headingStartInSanitized);

        if (text) {
          items.push({
            from: headingStart,
            level: sourceMatch?.[1]?.length ?? 1,
            text,
            to: offset + line.length
          });
        }
      }
    }

    offset += line.length + 1;
  }

  return items;
}

function mapSanitizedIndexToOriginal(line: string, sanitizedIndex: number) {
  let originalIndex = 0;
  let visibleIndex = 0;

  while (originalIndex < line.length) {
    ANCHOR_TAG_PATTERN.lastIndex = originalIndex;
    const anchorMatch = ANCHOR_TAG_PATTERN.exec(line);
    if (anchorMatch && anchorMatch.index === originalIndex) {
      originalIndex += anchorMatch[0].length;
      continue;
    }
    if (visibleIndex === sanitizedIndex) {
      return originalIndex;
    }
    visibleIndex += 1;
    originalIndex += 1;
  }

  return originalIndex;
}
