const FRONTMATTER_DELIMITER_PATTERN = /^---[ \t]*$/;
const TITLE_ENTRY_PATTERN = /^([ \t]*)title[ \t]*:[ \t]*(.*)$/i;
const HEADING_ONE_PATTERN = /^\s{0,3}#\s+(.+?)\s*#*\s*$/;
const HEADING_PATTERN = /^(\s{0,3})(#{1,6})([ \t]+.*)$/;
const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;

function unquoteYamlScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) {
    return trimmed;
  }
  return trimmed.slice(1, -1).trim();
}

function findFrontmatterEnd(lines: string[]) {
  if (!FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return -1;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return index;
    }
  }
  return -1;
}

function normalizeBodyWithTitle(bodyLines: string[], title: string) {
  const firstBodyLineIndex = bodyLines.findIndex((line) => line.trim().length > 0);
  if (firstBodyLineIndex < 0) {
    return [`# ${title}`];
  }

  const firstBodyLine = bodyLines[firstBodyLineIndex] ?? '';
  const existingHeading = firstBodyLine.match(HEADING_ONE_PATTERN)?.[1]?.trim();
  if (existingHeading === title) {
    return bodyLines.slice(firstBodyLineIndex);
  }

  const body = bodyLines.slice(firstBodyLineIndex);
  return [`# ${title}`, '', ...demoteBodyHeadingsWhenNeeded(body)];
}

function demoteBodyHeadingsWhenNeeded(lines: string[]) {
  if (!lines.some((line) => HEADING_ONE_PATTERN.test(line))) {
    return lines;
  }

  let activeFence: '```' | '~~~' | null = null;
  return lines.map((line) => {
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
    const indent = headingMatch[1] ?? '';
    const markers = headingMatch[2] ?? '';
    const suffix = headingMatch[3] ?? '';
    return `${indent}${'#'.repeat(Math.min(6, markers.length + 1))}${suffix}`;
  });
}

export function normalizeImportedFrontmatterTitle(content: string) {
  const lines = content.split('\n');
  const endIndex = findFrontmatterEnd(lines);
  if (endIndex < 0) {
    return { content, title: null };
  }

  let title: string | null = null;
  const metaLines = lines.slice(1, endIndex).filter((line) => {
    const match = line.match(TITLE_ENTRY_PATTERN);
    if (!match || match[1]?.length) {
      return true;
    }
    const nextTitle = unquoteYamlScalar(match[2] ?? '');
    if (!nextTitle) {
      return true;
    }
    title = nextTitle;
    return false;
  });

  if (!title) {
    return { content, title: null };
  }

  const frontmatter = metaLines.length > 0 ? ['---', ...metaLines, '---', ''] : [];
  return {
    content: [...frontmatter, ...normalizeBodyWithTitle(lines.slice(endIndex + 1), title)].join('\n').trim(),
    title
  };
}
