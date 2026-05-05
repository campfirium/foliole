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

export async function inspectReadwiseReaderSetup(input: {
  highlightSeparator: string;
  readwiseRootPath: string;
}): Promise<NativeReadwiseDetectionResult> {
  const rootPath = input.readwiseRootPath.trim();
  if (!rootPath) {
    return createEmptyResult('Choose the Readwise root folder first.');
  }

  const articleDirectory = path.join(rootPath, 'Articles');
  const fullDocumentDirectory = path.join(rootPath, 'Full Document Contents', 'Articles');

  let candidateNames: string[];
  try {
    const markdownFiles = await listMarkdownFiles(articleDirectory);
    candidateNames = markdownFiles.slice(0, 3);
  } catch {
    return createEmptyResult('The Articles folder could not be read from the selected Readwise root.');
  }

  if (candidateNames.length === 0) {
    return createEmptyResult('No article samples were found in the Articles folder.');
  }

  const filePairs = await Promise.all(
    candidateNames.map(async (fileName) => {
      try {
        const articlePath = path.join(articleDirectory, fileName);
        const fullDocumentPath = path.join(fullDocumentDirectory, fileName);
        const [articleMarkdown, fullDocumentMarkdown] = await Promise.all([
          fs.readFile(articlePath, 'utf8'),
          fs.readFile(fullDocumentPath, 'utf8')
        ]);
        return probeReadwiseArticleContent({
          articleMarkdown,
          fullDocumentMarkdown,
          separator: input.highlightSeparator,
          sourceName: fileName.replace(/\.md$/i, '')
        });
      } catch {
        return null;
      }
    })
  );

  const usablePairs = filePairs.filter((entry): entry is NativeReadwiseDetectionResult => entry !== null);
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
