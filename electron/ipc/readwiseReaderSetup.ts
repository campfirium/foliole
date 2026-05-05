import { promises as fs } from 'node:fs';
import path from 'node:path';

import { probeReadwiseArticleContent } from '../../lib/core/import/readwiseReaderProbe.js';
import type { NativeReadwiseDetectionResult, NativeReadwiseDetectionSample } from '../../lib/platform/nativeReadwiseContract.js';

async function listMarkdownFiles(directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function createEmptyResult(message: string): NativeReadwiseDetectionResult {
  return {
    checkedSourceCount: 0,
    matchedHighlightCount: 0,
    message,
    sampleCount: 0,
    samples: [],
    success: false
  };
}

function resolveReadwiseSampleDirectories(input: {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
}) {
  const articleDirectory = input.articleDirectoryPath.trim();
  const fullDocumentDirectory = input.fullDocumentDirectoryPath.trim();
  if (!articleDirectory || !fullDocumentDirectory) {
    return null;
  }
  return { articleDirectory, fullDocumentDirectory };
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
  const markdownFiles = await listMarkdownFiles(input.articleDirectory);
  const candidateNames = markdownFiles.slice(0, 3);
  const filePairs = await Promise.all(
    candidateNames.map(async (fileName) => {
      try {
        const articlePath = path.join(input.articleDirectory, fileName);
        const fullDocumentPath = path.join(input.fullDocumentDirectory, fileName);
        const [articleMarkdown, fullDocumentMarkdown] = await Promise.all([
          fs.readFile(articlePath, 'utf8'),
          fs.readFile(fullDocumentPath, 'utf8')
        ]);
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
        return null;
      }
    })
  );
  return { candidateNames, filePairs };
}

export async function inspectReadwiseReaderSetup(input: {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  tagKeyword: string;
}): Promise<NativeReadwiseDetectionResult> {
  const directories = resolveReadwiseSampleDirectories(input);
  if (!directories) {
    return createEmptyResult('Choose both the Readwise Articles folders before previewing.');
  }

  let inspectedFiles: Awaited<ReturnType<typeof inspectReadwiseSampleFiles>>;
  try {
    inspectedFiles = await inspectReadwiseSampleFiles({
      articleDirectory: directories.articleDirectory,
      fullDocumentDirectory: directories.fullDocumentDirectory,
      highlightsHeading: input.highlightsHeading,
      highlightSeparator: input.highlightSeparator,
      newHighlightsHeading: input.newHighlightsHeading,
      noteKeyword: input.noteKeyword,
      tagKeyword: input.tagKeyword
    });
  } catch {
    return createEmptyResult('The Articles folder could not be read from the selected Readwise root.');
  }

  if (inspectedFiles.candidateNames.length === 0) {
    return createEmptyResult('No article samples were found in the Articles folder.');
  }

  const usablePairs = inspectedFiles.filePairs.filter((entry): entry is NativeReadwiseDetectionResult => entry !== null);
  if (usablePairs.length === 0) {
    return createEmptyResult('No matching full document samples were found for the Articles entries.');
  }

  const samples = usablePairs.flatMap((entry): NativeReadwiseDetectionSample[] => entry.samples).slice(0, 5);
  const matchedHighlightCount = samples.filter((sample: NativeReadwiseDetectionSample) => sample.matched).length;

  return {
    checkedSourceCount: usablePairs.length,
    matchedHighlightCount,
    message:
      matchedHighlightCount === samples.length
        ? `Checked ${usablePairs.length} article sample${usablePairs.length === 1 ? '' : 's'} successfully.`
        : 'Detection finished, but some sampled highlights could not be matched back to the article body.',
    sampleCount: samples.length,
    samples,
    success: samples.length > 0 && matchedHighlightCount === samples.length
  };
}
