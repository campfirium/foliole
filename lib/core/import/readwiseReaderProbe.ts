import type { NativeReadwiseDetectionResult, NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]+/g, ' ');
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeSeparator(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value: string) {
  return compactWhitespace(stripMarkdown(normalizeLineEndings(value)));
}

function trimHighlightMetadata(block: string, tagKeyword: string, noteKeyword: string) {
  const metadataKeywords = [tagKeyword, noteKeyword].filter((value) => value.trim().length > 0);
  return metadataKeywords
    .reduce(
      (current, keyword) =>
        current
          .replace(new RegExp(`\\s+${escapeRegex(keyword)}\\s*[\\s\\S]*$`, 'i'), '')
          .replace(new RegExp(`(^|\\n)\\s*${escapeRegex(keyword)}\\s*[\\s\\S]*$`, 'i'), '$1')
          .trim(),
      block
        .replace(/\s+\[\.\.\.]\s*\([^)]+\)/g, '')
        .replace(/\s+\([^()\n]+\)\s*$/g, '')
        .trim()
    )
    .trim();
}

function splitHighlightBlocks(content: string, separator: string) {
  const normalizedContent = normalizeLineEndings(content);
  const divider = separator.trim().length > 0 ? normalizeLineEndings(decodeSeparator(separator)) : '\n\n';
  return normalizedContent
    .split(divider)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractHighlightsSection(markdown: string, headings: string[]) {
  const normalized = normalizeLineEndings(markdown);
  const headingMatches = headings
    .filter((heading) => heading.trim().length > 0)
    .map((heading) => {
      const match = new RegExp(`^${escapeRegex(normalizeLineEndings(heading))}\\s*$`, 'im').exec(normalized);
      return match?.index ?? Number.POSITIVE_INFINITY;
    });
  const headingIndex = Math.min(...headingMatches, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(headingIndex)) {
    return normalized.trim();
  }
  const matchedHeading = headings.find((heading) => {
    if (!heading.trim()) {
      return false;
    }
    return new RegExp(`^${escapeRegex(normalizeLineEndings(heading))}\\s*$`, 'im').exec(normalized)?.index === headingIndex;
  });
  const section = normalized
    .slice(headingIndex + (matchedHeading ? normalizeLineEndings(matchedHeading).length : 0))
    .replace(/^\n+/, '');
  const nextHeadingIndex = section.search(/^## /m);
  return (nextHeadingIndex >= 0 ? section.slice(0, nextHeadingIndex) : section).trim();
}

function extractFullDocument(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const matches = [...normalized.matchAll(/^## Full Document[^\n]*$/gim)];
  const lastHeading = matches.at(-1);
  if (lastHeading?.index === undefined) {
    return normalized.trim();
  }
  const section = normalized.slice(lastHeading.index + lastHeading[0].length).replace(/^\n+/, '');
  const nextHeadingIndex = section.search(/^## /m);
  return (nextHeadingIndex >= 0 ? section.slice(0, nextHeadingIndex) : section).trim();
}

function createSample(
  sourceName: string,
  highlightText: string,
  fullDocument: string,
  tagKeyword: string,
  noteKeyword: string
): NativeReadwiseDetectionSample {
  const normalizedHighlight = normalizeText(trimHighlightMetadata(highlightText, tagKeyword, noteKeyword));
  const normalizedDocument = normalizeText(fullDocument);
  const matchIndex = normalizedHighlight ? normalizedDocument.indexOf(normalizedHighlight) : -1;
  const excerptStart = Math.max(0, matchIndex - 40);
  const excerptEnd = matchIndex >= 0 ? Math.min(normalizedDocument.length, matchIndex + normalizedHighlight.length + 40) : 0;

  return {
    excerpt: matchIndex >= 0 ? normalizedDocument.slice(excerptStart, excerptEnd) : '',
    highlightText: normalizedHighlight,
    matched: matchIndex >= 0,
    sourceName
  };
}

export function probeReadwiseArticleContent(input: {
  articleMarkdown: string;
  fullDocumentMarkdown: string;
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  sourceName: string;
  tagKeyword: string;
}): NativeReadwiseDetectionResult {
  const highlightBlocks = splitHighlightBlocks(
    extractHighlightsSection(input.articleMarkdown, [input.highlightsHeading, input.newHighlightsHeading]),
    input.highlightSeparator
  );
  const fullDocument = extractFullDocument(input.fullDocumentMarkdown);
  const samples = highlightBlocks
    .map((block) => createSample(input.sourceName, block, fullDocument, input.tagKeyword, input.noteKeyword))
    .filter((sample) => sample.highlightText.length > 0)
    .slice(0, 3);
  const matchedHighlightCount = samples.filter((sample) => sample.matched).length;

  if (samples.length === 0) {
    return {
      checkedSourceCount: 1,
      matchedHighlightCount: 0,
      message: 'No highlights were detected in the sampled article.',
      sampleCount: 0,
      samples: [],
      success: false
    };
  }

  return {
    checkedSourceCount: 1,
    matchedHighlightCount,
    message:
      matchedHighlightCount === samples.length
        ? 'Sampled highlights matched the full document.'
        : 'Some sampled highlights could not be matched back to the full document.',
    sampleCount: samples.length,
    samples,
    success: matchedHighlightCount === samples.length
  };
}
