export interface ReadwiseOriginalFilePlaceholderRange {
  from: number;
  hiddenRanges: Array<{ from: number; to: number }>;
  kind: string;
  sourceLabel: string;
  to: number;
}

export interface ReadwiseOriginalFilePlaceholderLine {
  from: number;
  text: string;
}

const OMITTED_RE = /Full text .* document is an? (PDF|EPUB)/i;
const DOWNLOAD_RE = /\[Download original file[^\]]*]\((https?:\/\/[^)\s]+)\)/i;
const RAW_CONTENT_RE = /(https?:\/\/\S*\/document_raw_content\/\d+\S*)/i;
const LEGACY_STATUS_HEADING_RE = /^##\s+Current status\s*$/i;
const LEGACY_NEXT_ACTIONS_HEADING_RE = /^##\s+Next actions\s*$/i;
const LEGACY_ORIGINAL_FILE_MISSING_RE = /Original file missing/i;
const LEGACY_BOOK_IMPORT_PENDING_RE = /Book import pending/i;
const LEGACY_DOWNLOAD_ACTION_RE = /Download original file/i;
const LEGACY_LOAD_ACTION_RE = /Load original file/i;
const LEGACY_IN_PROGRESS_RE = /In progress/i;

export function collectReadwiseOriginalFilePlaceholderRanges(source: string): ReadwiseOriginalFilePlaceholderRange[] {
  return collectReadwiseOriginalFilePlaceholderRangesFromLines(toPlaceholderLines(source));
}

export function collectReadwiseOriginalFilePlaceholderRangesFromLines(
  lines: readonly ReadwiseOriginalFilePlaceholderLine[]
): ReadwiseOriginalFilePlaceholderRange[] {
  const ranges: ReadwiseOriginalFilePlaceholderRange[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const legacyRange = buildLegacyBookPlaceholderRange(lines, index);
    if (legacyRange) {
      ranges.push(legacyRange);
      continue;
    }
    const omittedMatch = OMITTED_RE.exec(line.text);
    if (!omittedMatch) {
      continue;
    }
    const range = buildPlaceholderRange(lines, index, line.from, omittedMatch[1]?.toUpperCase() ?? 'Original file');
    ranges.push(range);
  }
  return ranges;
}

function toPlaceholderLines(source: string): ReadwiseOriginalFilePlaceholderLine[] {
  const lines: ReadwiseOriginalFilePlaceholderLine[] = [];
  let offset = 0;
  for (const text of source.split(/\n/u)) {
    lines.push({ from: offset, text });
    offset += text.length + 1;
  }
  return lines;
}

function buildPlaceholderRange(
  lines: readonly ReadwiseOriginalFilePlaceholderLine[],
  index: number,
  from: number,
  kind: string
): ReadwiseOriginalFilePlaceholderRange {
  const to = from + (lines[index]?.text.length ?? 0);
  let sourceLabel = 'Readwise original file';
  const hiddenRanges: Array<{ from: number; to: number }> = [];
  for (let cursor = index + 1; cursor < lines.length && cursor <= index + 3; cursor += 1) {
    const line = lines[cursor];
    if (!line) {
      continue;
    }
    const downloadUrl = DOWNLOAD_RE.exec(line.text)?.[1] ?? RAW_CONTENT_RE.exec(line.text)?.[1] ?? null;
    if (downloadUrl) {
      sourceLabel = formatSourceLabel(downloadUrl);
      hiddenRanges.push({ from: line.from, to: line.from + line.text.length });
      break;
    }
    if (line.text.trim()) break;
  }
  return { from, hiddenRanges, kind, sourceLabel, to };
}

function buildLegacyBookPlaceholderRange(
  lines: readonly ReadwiseOriginalFilePlaceholderLine[],
  index: number
): ReadwiseOriginalFilePlaceholderRange | null {
  const line = lines[index];
  if (!line || !LEGACY_STATUS_HEADING_RE.test(line.text.trim())) {
    return null;
  }
  let hasOriginalFileMissing = false;
  let hasBookImportPending = false;
  let hasDownloadAction = false;
  let hasLoadAction = false;
  const hiddenRanges: Array<{ from: number; to: number }> = [];
  for (let cursor = index + 1; cursor < lines.length && cursor <= index + 12; cursor += 1) {
    const candidate = lines[cursor];
    if (!candidate) {
      continue;
    }
    const text = candidate.text.trim();
    if (text.startsWith('# ') || (text.startsWith('## ') && !LEGACY_NEXT_ACTIONS_HEADING_RE.test(text))) {
      break;
    }
    if (candidate.text.length > 0) {
      hiddenRanges.push({ from: candidate.from, to: candidate.from + candidate.text.length });
    }
    hasOriginalFileMissing ||= LEGACY_ORIGINAL_FILE_MISSING_RE.test(text);
    hasBookImportPending ||= LEGACY_BOOK_IMPORT_PENDING_RE.test(text);
    hasDownloadAction ||= LEGACY_DOWNLOAD_ACTION_RE.test(text);
    hasLoadAction ||= LEGACY_LOAD_ACTION_RE.test(text);
    if (LEGACY_IN_PROGRESS_RE.test(text)) {
      break;
    }
  }
  if (!hasOriginalFileMissing || !hasBookImportPending || !hasDownloadAction || !hasLoadAction) {
    return null;
  }
  return {
    from: line.from,
    hiddenRanges,
    kind: 'EPUB',
    sourceLabel: 'Readwise original file',
    to: line.from + line.text.length
  };
}

function formatSourceLabel(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return sourceUrl;
  }
}
