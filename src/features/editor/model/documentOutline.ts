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
      const directMatch = line.match(HEADING_PATTERN);
      if (directMatch) {
        const text = stripInlineMarkdown(directMatch[2] ?? '');
        const headingPrefixLength = (directMatch[1]?.length ?? 0) + 1;
        const headingStart = offset + line.search(/\S|$/) + headingPrefixLength;

        if (text) {
          items.push({
            from: headingStart,
            level: directMatch[1]?.length ?? 1,
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
