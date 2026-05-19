export interface ReadwiseOriginalFilePlaceholderRange {
  from: number;
  hiddenRanges: Array<{ from: number; to: number }>;
  kind: string;
  sourceLabel: string;
  to: number;
}

const OMITTED_RE = /Full text .* document is an? (PDF|EPUB)/i;
const DOWNLOAD_RE = /\[Download original file[^\]]*]\((https?:\/\/[^)\s]+)\)/i;
const RAW_CONTENT_RE = /(https?:\/\/\S*\/document_raw_content\/\d+\S*)/i;

export function collectReadwiseOriginalFilePlaceholderRanges(source: string): ReadwiseOriginalFilePlaceholderRange[] {
  const ranges: ReadwiseOriginalFilePlaceholderRange[] = [];
  const lines = source.split(/\n/u);
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const omittedMatch = OMITTED_RE.exec(line);
    if (!omittedMatch) {
      offset += line.length + 1;
      continue;
    }
    const range = buildPlaceholderRange(lines, index, offset, omittedMatch[1]?.toUpperCase() ?? 'Original file');
    ranges.push(range);
    offset += line.length + 1;
  }
  return ranges;
}

function buildPlaceholderRange(lines: string[], index: number, from: number, kind: string): ReadwiseOriginalFilePlaceholderRange {
  const to = from + lines[index].length;
  let sourceLabel = 'Readwise original file';
  const hiddenRanges: Array<{ from: number; to: number }> = [];
  let cursorOffset = to + 1;
  for (let cursor = index + 1; cursor < lines.length && cursor <= index + 3; cursor += 1) {
    const line = lines[cursor];
    const downloadUrl = DOWNLOAD_RE.exec(line)?.[1] ?? RAW_CONTENT_RE.exec(line)?.[1] ?? null;
    if (downloadUrl) {
      sourceLabel = formatSourceLabel(downloadUrl);
      hiddenRanges.push({ from: cursorOffset, to: cursorOffset + line.length });
      break;
    }
    cursorOffset += line.length + 1;
    if (line.trim()) break;
  }
  return { from, hiddenRanges, kind, sourceLabel, to };
}

function formatSourceLabel(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return sourceUrl;
  }
}
