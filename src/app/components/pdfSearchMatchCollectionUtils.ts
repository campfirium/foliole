import type { PdfPageTextEntry } from './pdfPageText';

export function resolveIndexedEntry(entry: PdfPageTextEntry | string | undefined) {
  return typeof entry === 'string'
    ? { itemRanges: [] as Array<{ end: number; start: number }>, text: entry }
    : entry ?? { itemRanges: [] as Array<{ end: number; start: number }>, text: '' };
}

export function resolvePageBounds(shell: HTMLDivElement) {
  return shell.querySelector<HTMLElement>('.react-pdf__Page') ?? shell;
}

interface SearchProjection {
  indexMap: number[];
  text: string;
}

function projectSearchableText(value: string): SearchProjection {
  const indexMap: number[] = [];
  let text = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char || /\s/u.test(char)) {
      continue;
    }
    indexMap.push(index);
    text += char;
  }
  return { indexMap, text };
}

export function collectMappedQueryRanges(text: string, query: string) {
  if (!text || !query) {
    return [] as Array<{ end: number; start: number }>;
  }
  const projectedText = projectSearchableText(text);
  const projectedQuery = projectSearchableText(query);
  if (!projectedText.text || !projectedQuery.text) {
    return [] as Array<{ end: number; start: number }>;
  }
  const ranges: Array<{ end: number; start: number }> = [];
  let cursor = 0;
  while (cursor < projectedText.text.length) {
    const next = projectedText.text.indexOf(projectedQuery.text, cursor);
    if (next < 0) {
      break;
    }
    const mappedStart = projectedText.indexMap[next];
    const lastProjectedIndex = next + projectedQuery.text.length - 1;
    const mappedLast = projectedText.indexMap[lastProjectedIndex];
    if (typeof mappedStart === 'number' && typeof mappedLast === 'number' && mappedLast >= mappedStart) {
      ranges.push({ end: mappedLast + 1, start: mappedStart });
    }
    cursor = next + 1;
  }
  return ranges;
}
