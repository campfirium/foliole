import { promises as fs } from 'node:fs';
import path from 'node:path';

import { probeReadwiseArticleContent } from '../../lib/core/import/readwiseReaderProbe.js';
import type {
  NativeReadwiseDetectionResult,
  NativeReadwiseDetectionSample,
  NativeReadwiseDetectionSource
} from '../../lib/platform/nativeReadwiseContract.js';

async function listMarkdownFiles(directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return [];
    }
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function createScanResult(input: {
  candidateCount: number;
  highlightOnlySourceCount: number;
  highlightedArticleCount: number;
  highlightedHighlightCount: number;
  message: string;
  sampledArticle: NativeReadwiseDetectionResult | null;
  totalArticleCount: number;
  unparsedHighlightFileCount: number;
}): NativeReadwiseDetectionResult {
  const samples = input.sampledArticle?.samples ?? [];
  const matchedHighlightCount = samples.filter((sample: NativeReadwiseDetectionSample) => sample.matched).length;
  return {
    checkedSourceCount: input.candidateCount,
    detectedHighlightCount: input.highlightedHighlightCount,
    highlightOnlySourceCount: input.highlightOnlySourceCount,
    highlightedArticleCount: input.highlightedArticleCount,
    matchedHighlightCount,
    message: input.message,
    sampleCount: samples.length,
    samples,
    success: samples.length > 0 && matchedHighlightCount === samples.length,
    totalArticleCount: input.totalArticleCount,
    unparsedHighlightFileCount: input.unparsedHighlightFileCount
  };
}

function createNoHighlightedArticlesResult(totalArticleCount: number) {
  return createScanResult({
    candidateCount: 0,
    highlightOnlySourceCount: 0,
    highlightedArticleCount: 0,
    highlightedHighlightCount: 0,
    message: 'No articles with highlights were found in the selected Readwise folders.',
    sampledArticle: null,
    totalArticleCount,
    unparsedHighlightFileCount: 0
  });
}

function hasReadwiseHighlightsHeading(markdown: string, headings: string[]) {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  return headings.some((heading) => {
    if (!heading.trim()) {
      return false;
    }
    const normalizedHeading = heading.replace(/\r\n?/g, '\n');
    return new RegExp(`^${normalizedHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im').test(normalized);
  });
}

async function inspectReadwiseSampleFiles(input: {
  articleDirectory: string;
  fullDocumentDirectory: string;
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  tagKeyword: string;
}) {
  const [markdownFiles, fullDocumentFiles] = await Promise.all([
    listMarkdownFiles(input.articleDirectory),
    listMarkdownFiles(input.fullDocumentDirectory)
  ]);
  let highlightedArticleCount = 0;
  let highlightedHighlightCount = 0;
  let sampledArticle: NativeReadwiseDetectionResult | null = null;
  const fullDocumentFileNames = new Set(fullDocumentFiles);

  for (const fileName of markdownFiles) {
    const result = await inspectReadwiseSidecarFile(input, fileName);
    if (result.sampleCount > 0) {
      highlightedArticleCount += 1;
      highlightedHighlightCount += result.detectedHighlightCount;
      sampledArticle ??= result;
    }
  }

  return {
    candidateNames: markdownFiles,
    highlightOnlySourceCount: markdownFiles.filter((fileName) => !fullDocumentFileNames.has(fileName)).length,
    highlightedArticleCount,
    highlightedHighlightCount,
    sampledArticle,
    totalArticleCount: fullDocumentFiles.length,
    unparsedHighlightFileCount: markdownFiles.length - highlightedArticleCount
  };
}

async function inspectReadwiseSidecarFile(
  input: Parameters<typeof inspectReadwiseSampleFiles>[0],
  fileName: string
): Promise<NativeReadwiseDetectionResult> {
  try {
    const articlePath = path.join(input.articleDirectory, fileName);
    const fullDocumentPath = path.join(input.fullDocumentDirectory, fileName);
    const articleMarkdown = await fs.readFile(articlePath, 'utf8');
    if (!hasReadwiseHighlightsHeading(articleMarkdown, [input.highlightsHeading, input.newHighlightsHeading])) {
      return createNoHighlightedArticlesResult(0);
    }
    const fullDocumentMarkdown = await fs.readFile(fullDocumentPath, 'utf8').catch(() => '');
    return probeReadwiseArticleContent({
      articleMarkdown,
      fullDocumentMarkdown,
      highlightsHeading: input.highlightsHeading,
      highlightSeparator: input.highlightSeparator,
      newHighlightsHeading: input.newHighlightsHeading,
      noteKeyword: input.noteKeyword,
      sourceName: fileName.replace(/\.md$/i, ''),
      tagKeyword: input.tagKeyword
    });
  } catch {
    return createNoHighlightedArticlesResult(0);
  }
}

async function inspectReadwiseSourceFiles(input: NativeReadwiseDetectionSource & {
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  tagKeyword: string;
}) {
  return inspectReadwiseSampleFiles({
    articleDirectory: input.articleDirectoryPath,
    fullDocumentDirectory: input.fullDocumentDirectoryPath,
    highlightsHeading: input.highlightsHeading,
    highlightSeparator: input.highlightSeparator,
    newHighlightsHeading: input.newHighlightsHeading,
    noteKeyword: input.noteKeyword,
    tagKeyword: input.tagKeyword
  });
}

function combineReadwiseSourceInspections(inspections: Awaited<ReturnType<typeof inspectReadwiseSampleFiles>>[]) {
  return inspections.reduce(
    (combined, inspection) => ({
      candidateCount: combined.candidateCount + inspection.candidateNames.length,
      highlightOnlySourceCount: combined.highlightOnlySourceCount + inspection.highlightOnlySourceCount,
      highlightedArticleCount: combined.highlightedArticleCount + inspection.highlightedArticleCount,
      highlightedHighlightCount: combined.highlightedHighlightCount + inspection.highlightedHighlightCount,
      sampledArticle: combined.sampledArticle ?? inspection.sampledArticle,
      totalArticleCount: combined.totalArticleCount + inspection.totalArticleCount,
      unparsedHighlightFileCount: combined.unparsedHighlightFileCount + inspection.unparsedHighlightFileCount
    }),
    {
      candidateCount: 0,
      highlightOnlySourceCount: 0,
      highlightedArticleCount: 0,
      highlightedHighlightCount: 0,
      sampledArticle: null as NativeReadwiseDetectionResult | null,
      totalArticleCount: 0,
      unparsedHighlightFileCount: 0
    }
  );
}

export async function inspectReadwiseSources(input: {
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  sources: NativeReadwiseDetectionSource[];
  tagKeyword: string;
}): Promise<NativeReadwiseDetectionResult> {
  const inspections = await Promise.all(input.sources.map((source) => inspectReadwiseSourceFiles({ ...input, ...source })));
  const inspectedFiles = combineReadwiseSourceInspections(inspections);
  if (inspectedFiles.candidateCount === 0) {
    return createNoHighlightedArticlesResult(inspectedFiles.totalArticleCount);
  }
  if (!inspectedFiles.sampledArticle) {
    return createScanResult({
      candidateCount: inspectedFiles.candidateCount,
      highlightOnlySourceCount: inspectedFiles.highlightOnlySourceCount,
      highlightedArticleCount: inspectedFiles.highlightedArticleCount,
      highlightedHighlightCount: inspectedFiles.highlightedHighlightCount,
      message: 'No article with highlights was found in the selected Readwise folders.',
      sampledArticle: null,
      totalArticleCount: inspectedFiles.totalArticleCount,
      unparsedHighlightFileCount: inspectedFiles.unparsedHighlightFileCount
    });
  }

  const samples = inspectedFiles.sampledArticle.samples;
  const matchedHighlightCount = samples.filter((sample) => sample.matched).length;
  return createScanResult({
    candidateCount: inspectedFiles.candidateCount,
    highlightOnlySourceCount: inspectedFiles.highlightOnlySourceCount,
    highlightedArticleCount: inspectedFiles.highlightedArticleCount,
    highlightedHighlightCount: inspectedFiles.highlightedHighlightCount,
    message:
      matchedHighlightCount === samples.length
        ? 'The sample article imported correctly.'
        : 'Detection finished, but some sampled highlights could not be matched back to the article body.',
    sampledArticle: inspectedFiles.sampledArticle,
    totalArticleCount: inspectedFiles.totalArticleCount,
    unparsedHighlightFileCount: inspectedFiles.unparsedHighlightFileCount
  });
}
