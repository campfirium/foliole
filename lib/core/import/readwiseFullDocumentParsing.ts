const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;
const HEADING_PATTERN = /^(\s{0,3})(#{1,6})([ \t]+.*)$/;

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function slugifyMetadataKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractReadwiseShellTitle(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const shellEnd = normalized.search(/^##\s+(?:Metadata|Full Document)[^\n]*$/im);
  const shellHeader = shellEnd >= 0 ? normalized.slice(0, shellEnd) : normalized;
  const match = shellHeader.match(/^#\s+(.+?)\s*#*\s*$/m);
  return match?.[1]?.trim() ?? '';
}

function parseReadwiseMetadataSection(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const lines = normalized.split('\n');
  const startIndex = lines.findIndex((line) => /^## Metadata[^\n]*$/i.test(line.trim()));
  if (startIndex < 0) {
    return [];
  }
  const sectionLines = lines.slice(startIndex + 1);
  const nextHeadingIndex = sectionLines.findIndex((line) => /^##\s+/.test(line));
  return (nextHeadingIndex >= 0 ? sectionLines.slice(0, nextHeadingIndex) : sectionLines)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const entry = /^-?\s*([^:]+):\s*(.+?)\s*$/.exec(line);
      if (!entry) {
        return [];
      }
      const rawKey = entry[1];
      const rawValue = entry[2];
      if (!rawKey || !rawValue) {
        return [];
      }
      const key = slugifyMetadataKey(rawKey);
      const value = rawValue.trim();
      return key && value ? [{ key, value }] : [];
    });
}

function renderReadwiseFrontmatter(metadata: Array<{ key: string; value: string }>, options?: {
  excludeKeys?: readonly string[];
}) {
  const excludedKeys = new Set(options?.excludeKeys ?? []);
  const filteredMetadata = metadata.filter(({ key }) => !excludedKeys.has(key));
  if (filteredMetadata.length === 0) {
    return '';
  }
  return ['---', ...filteredMetadata.map(({ key, value }) => `${key}: ${value}`), '---'].join('\n');
}

export function extractReadwiseFullDocumentFrontmatter(markdown: string, options?: {
  excludeKeys?: readonly string[];
}) {
  return renderReadwiseFrontmatter(parseReadwiseMetadataSection(markdown), options);
}

export function extractReadwiseFullDocumentSummary(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const lines = normalized.split('\n');
  const startIndex = lines.findIndex((line) => /^## Metadata[^\n]*$/i.test(line.trim()));
  if (startIndex < 0) {
    return null;
  }
  const sectionLines = lines.slice(startIndex + 1);
  const sectionEndIndex = sectionLines.findIndex((line) => /^##\s+/.test(line));
  const metadataLines = sectionEndIndex >= 0 ? sectionLines.slice(0, sectionEndIndex) : sectionLines;
  const summaryIndex = metadataLines.findIndex((line) => /^-?\s*summary\s*:/i.test(line.trim()));
  if (summaryIndex < 0) {
    return null;
  }
  const firstLine = metadataLines[summaryIndex]?.replace(/^-?\s*summary\s*:\s*/i, '') ?? '';
  const continuationLines = metadataLines.slice(summaryIndex + 1);
  const nextMetadataIndex = continuationLines.findIndex((line) => /^-?\s*[^:\n]+:\s*\S/.test(line.trim()));
  const bodyLines = nextMetadataIndex >= 0 ? continuationLines.slice(0, nextMetadataIndex) : continuationLines;
  const summary = [firstLine, ...bodyLines].join('\n').trim();
  return summary || null;
}

export function extractReadwiseFullDocument(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const matches = [...normalized.matchAll(/^## Full Document[^\n]*$/gim)];
  const lastHeading = matches.at(-1);
  if (lastHeading?.index === undefined) {
    return normalized.trim();
  }
  return normalized.slice(lastHeading.index + lastHeading[0].length).replace(/^\n+/, '').trim();
}

export function liftReadwiseFullDocumentBodyHeadings(body: string) {
  const lines = normalizeLineEndings(body).split('\n');
  let activeFence: '```' | '~~~' | null = null;

  return lines
    .map((line) => {
      const fenceMatch = line.match(FENCE_PATTERN);
      if (fenceMatch) {
        const marker = fenceMatch[1] as '```' | '~~~';
        activeFence = activeFence === marker ? null : marker;
        return line;
      }
      if (activeFence || /^(?: {4}|\t)/.test(line)) {
        return line;
      }

      const headingMatch = line.match(HEADING_PATTERN);
      if (!headingMatch) {
        return line;
      }

      const indent = headingMatch[1] ?? '';
      const markers = headingMatch[2];
      const suffix = headingMatch[3] ?? '';
      if (!markers) {
        return line;
      }
      const nextLevel = Math.max(2, markers.length - 1);
      return `${indent}${'#'.repeat(nextLevel)}${suffix}`;
    })
    .join('\n')
    .trim();
}

export function parseReadwiseFullDocumentImport(markdown: string) {
  const nodeTitle = extractReadwiseShellTitle(markdown);
  const titleHeading = nodeTitle ? `# ${nodeTitle}` : '';
  const frontmatter = extractReadwiseFullDocumentFrontmatter(markdown);
  const summary = extractReadwiseFullDocumentSummary(markdown);
  const body = liftReadwiseFullDocumentBodyHeadings(extractReadwiseFullDocument(markdown));
  const header = [frontmatter, titleHeading].filter(Boolean).join('\n');
  const content = [header, body].filter(Boolean).join('\n\n');
  return {
    content,
    nodeTitle,
    summary
  };
}
