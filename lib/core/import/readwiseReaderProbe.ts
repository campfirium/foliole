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

function normalizeText(value: string) {
  return compactWhitespace(stripMarkdown(normalizeLineEndings(value)));
}

function trimHighlightMetadata(block: string) {
  return block
    .replace(/\s+\[\.\.\.]\s*\([^)]+\)/g, '')
    .replace(/\s+\([^()\n]+\)\s*$/g, '')
    .replace(/\s+Tags:\s[\s\S]*$/g, '')
    .replace(/\s+Note:\s[\s\S]*$/g, '')
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

function extractHighlightsSection(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const headingMatch = normalized.match(/^## (?:New )?highlights[^\n]*$/im);
  if (headingMatch?.index === undefined) {
    return normalized.trim();
  }
  const section = normalized.slice(headingMatch.index + headingMatch[0].length).replace(/^\n+/, '');
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

function createSample(sourceName: string, highlightText: string, fullDocument: string): NativeReadwiseDetectionSample {
  const normalizedHighlight = normalizeText(trimHighlightMetadata(highlightText));
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
  separator: string;
  sourceName: string;
}): NativeReadwiseDetectionResult {
  const highlightBlocks = splitHighlightBlocks(extractHighlightsSection(input.articleMarkdown), input.separator);
  const fullDocument = extractFullDocument(input.fullDocumentMarkdown);
  const samples = highlightBlocks
    .map((block) => createSample(input.sourceName, block, fullDocument))
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
