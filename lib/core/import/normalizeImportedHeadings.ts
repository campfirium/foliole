const BLOCKQUOTE_PATTERN = /^\s{0,3}>/;
const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;
const HEADING_PATTERN = /^(\s{0,3})(#+)([ \t]+.*)$/;

function collectBodyHeadingLevels(lines: string[]) {
  const levels: number[] = [];
  let activeFence: '```' | '~~~' | null = null;

  for (const line of lines) {
    if (BLOCKQUOTE_PATTERN.test(line)) {
      continue;
    }

    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[1] as '```' | '~~~';
      activeFence = activeFence === marker ? null : marker;
      continue;
    }

    if (activeFence) {
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch) {
      levels.push(headingMatch[2].length);
    }
  }

  return levels;
}

export function normalizeImportedMarkdownHeadings(content: string) {
  const lines = content.split('\n');
  const headingLevels = collectBodyHeadingLevels(lines);
  const highestLevel = Math.min(...headingLevels);

  if (!Number.isFinite(highestLevel)) {
    return content;
  }

  const levelOffset = 2 - highestLevel;
  if (levelOffset === 0) {
    return content;
  }

  let activeFence: '```' | '~~~' | null = null;

  return lines
    .map((line) => {
      if (BLOCKQUOTE_PATTERN.test(line)) {
        return line;
      }

      const fenceMatch = line.match(FENCE_PATTERN);
      if (fenceMatch) {
        const marker = fenceMatch[1] as '```' | '~~~';
        activeFence = activeFence === marker ? null : marker;
        return line;
      }

      if (activeFence) {
        return line;
      }

      const headingMatch = line.match(HEADING_PATTERN);
      if (!headingMatch) {
        return line;
      }

      const nextLevel = headingMatch[2].length + levelOffset;
      return `${headingMatch[1]}${'#'.repeat(nextLevel)}${headingMatch[3]}`;
    })
    .join('\n');
}
