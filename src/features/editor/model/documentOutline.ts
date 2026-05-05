import { stripAnchorBlocks } from './anchorBlocks';
import { mapVisibleOffsetToRawPosition } from './anchorTextOffsets';

export interface DocumentOutlineItem {
  from: number;
  level: number;
  text: string;
  to: number;
}

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
      const sanitizedLine = stripAnchorBlocks(line);
      const sanitizedMatch = sanitizedLine.match(HEADING_PATTERN);
      const directMatch = line.match(HEADING_PATTERN);

      if (directMatch || sanitizedMatch) {
        const sourceLine = sanitizedMatch ? sanitizedLine : line;
        const sourceMatch = sanitizedMatch ?? directMatch;
        const text = stripInlineMarkdown(sourceMatch?.[2] ?? '');
        const headingPrefixLength = (sourceMatch?.[1]?.length ?? 0) + 1;
        const headingStartInSanitized = sourceLine.search(/\S|$/) + headingPrefixLength;
        const headingStart = offset + mapVisibleOffsetToRawPosition(line, headingStartInSanitized);

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
