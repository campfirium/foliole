import { collectMarkdownLineClassRanges } from '../../features/editor/model/markdownBlockProjection';
import { collectMarkdownCodeFenceProjection } from '../../features/editor/model/markdownCodeFenceProjection';

export interface SourceUpdateAlignedRow {
  currentLine: string | null;
  updatedLine: string | null;
}

interface LineProfile {
  className: string | null;
  isBlank: boolean;
  isNumeric: boolean;
  normalizedRenderedText: string;
  text: string;
}

const MAX_DP_CELLS = 1_000_000;

function splitIntoLines(content: string) {
  return content.split('\n');
}

function renderLineText(text: string, className: string | null) {
  if (className === 'cm-line-code-fence') {
    return '';
  }
  if (className === 'cm-line-h1' || className === 'cm-line-h2' || className === 'cm-line-h3') {
    return text.replace(/^\s*#{1,6}\s*/, '');
  }
  if (className === 'cm-line-quote') {
    return text.replace(/^(\s*(?:>\s*)+)/, '');
  }
  if (className === 'cm-line-list-unordered') {
    return text.replace(/^(\s*[-*+]\s+)/, '• ');
  }
  if (className === 'cm-line-list') {
    return text.replace(/^(\s*)(\d+)([.)])(\s+)/, '$2$3 ');
  }
  return text;
}

function normalizeRenderedText(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildLineProfiles(lines: string[]) {
  const text = lines.join('\n');
  const codeFenceProjection = collectMarkdownCodeFenceProjection(text);
  const markdownLineClasses = new Map(collectMarkdownLineClassRanges(text).map((range) => [range.from, range.className]));
  let position = 0;

  return lines.map((text) => {
    const className = codeFenceProjection.fenceLineFroms.has(position)
      ? 'cm-line-code-fence'
      : codeFenceProjection.codeLineFroms.has(position)
        ? 'cm-line-code'
        : markdownLineClasses.get(position) ?? null;
    const normalizedRenderedText = normalizeRenderedText(renderLineText(text, className));
    const profile: LineProfile = {
      className,
      isBlank: normalizedRenderedText.length === 0,
      isNumeric: /^[\d\s]+$/.test(normalizedRenderedText) && normalizedRenderedText.length > 0,
      normalizedRenderedText,
      text
    };

    position += text.length + 1;

    return profile;
  });
}

function buildCharacterBigramCounts(text: string) {
  const chars = Array.from(text);
  const counts = new Map<string, number>();

  if (chars.length < 2) {
    return counts;
  }

  for (let index = 0; index < chars.length - 1; index += 1) {
    const bigram = `${chars[index]}${chars[index + 1]}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return counts;
}

function calculateDiceSimilarity(left: string, right: string) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  if (leftChars.length < 2 || rightChars.length < 2) {
    const overlap = leftChars.filter((char) => rightChars.includes(char)).length;
    return (2 * overlap) / (leftChars.length + rightChars.length);
  }

  const leftCounts = buildCharacterBigramCounts(left);
  let overlap = 0;

  for (let index = 0; index < rightChars.length - 1; index += 1) {
    const bigram = `${rightChars[index]}${rightChars[index + 1]}`;
    const count = leftCounts.get(bigram) ?? 0;
    if (count <= 0) {
      continue;
    }
    overlap += 1;
    leftCounts.set(bigram, count - 1);
  }

  return (2 * overlap) / ((leftChars.length - 1) + (rightChars.length - 1));
}

function getGapPenalty(profile: LineProfile) {
  return profile.isBlank ? -1 : -3;
}

function getPairScore(current: LineProfile, updated: LineProfile) {
  if (current.text === updated.text) {
    return current.isBlank ? 1 : 10;
  }

  if (current.isBlank !== updated.isBlank) {
    return -7;
  }

  const similarity = calculateDiceSimilarity(current.normalizedRenderedText, updated.normalizedRenderedText);

  let score = -6;
  if (similarity >= 0.92) {
    score = 8;
  } else if (similarity >= 0.72) {
    score = 6;
  } else if (similarity >= 0.55) {
    score = current.className === updated.className ? 4 : 2;
  } else if (similarity >= 0.4 && current.className === updated.className && !current.isNumeric && !updated.isNumeric) {
    score = 1;
  }

  if (current.className !== updated.className && similarity < 0.9) {
    score -= 1;
  }

  const currentHeading = current.className === 'cm-line-h1' || current.className === 'cm-line-h2' || current.className === 'cm-line-h3';
  const updatedHeading = updated.className === 'cm-line-h1' || updated.className === 'cm-line-h2' || updated.className === 'cm-line-h3';
  if (currentHeading !== updatedHeading) {
    score -= 3;
  }

  if (current.isNumeric !== updated.isNumeric) {
    score -= 2;
  }

  return score;
}

function buildFallbackRows(currentLines: string[], updatedLines: string[]) {
  const rows: SourceUpdateAlignedRow[] = [];
  let currentIndex = 0;
  let updatedIndex = 0;

  while (currentIndex < currentLines.length) {
    const currentLine = currentLines[currentIndex] ?? '';
    const matchingUpdatedIndex = updatedLines.findIndex((updatedLine, index) => index >= updatedIndex && updatedLine === currentLine);

    if (matchingUpdatedIndex === -1) {
      rows.push({ currentLine, updatedLine: null });
      currentIndex += 1;
      continue;
    }

    while (updatedIndex < matchingUpdatedIndex) {
      rows.push({ currentLine: null, updatedLine: updatedLines[updatedIndex] ?? '' });
      updatedIndex += 1;
    }

    rows.push({ currentLine, updatedLine: updatedLines[updatedIndex] ?? '' });
    currentIndex += 1;
    updatedIndex += 1;
  }

  while (updatedIndex < updatedLines.length) {
    rows.push({ currentLine: null, updatedLine: updatedLines[updatedIndex] ?? '' });
    updatedIndex += 1;
  }

  return rows;
}

export function alignSourceUpdateLines(currentContent: string, updatedContent: string): SourceUpdateAlignedRow[] {
  const currentLines = splitIntoLines(currentContent);
  const updatedLines = splitIntoLines(updatedContent);
  const rowCount = currentLines.length + 1;
  const columnCount = updatedLines.length + 1;

  if (rowCount * columnCount > MAX_DP_CELLS) {
    return buildFallbackRows(currentLines, updatedLines);
  }

  const currentProfiles = buildLineProfiles(currentLines);
  const updatedProfiles = buildLineProfiles(updatedLines);
  const dp = Array.from({ length: rowCount }, () => new Int32Array(columnCount));

  for (let currentIndex = currentProfiles.length - 1; currentIndex >= 0; currentIndex -= 1) {
    const currentRow = dp[currentIndex];
    const nextRow = dp[currentIndex + 1];
    const currentProfile = currentProfiles[currentIndex];
    if (!currentRow || !nextRow || !currentProfile) continue;
    currentRow[updatedProfiles.length] = (nextRow[updatedProfiles.length] ?? 0) + getGapPenalty(currentProfile);
  }
  for (let updatedIndex = updatedProfiles.length - 1; updatedIndex >= 0; updatedIndex -= 1) {
    const lastRow = dp[currentProfiles.length];
    const updatedProfile = updatedProfiles[updatedIndex];
    if (!lastRow || !updatedProfile) continue;
    lastRow[updatedIndex] = (lastRow[updatedIndex + 1] ?? 0) + getGapPenalty(updatedProfile);
  }

  for (let currentIndex = currentProfiles.length - 1; currentIndex >= 0; currentIndex -= 1) {
    for (let updatedIndex = updatedProfiles.length - 1; updatedIndex >= 0; updatedIndex -= 1) {
      const currentRow = dp[currentIndex];
      const nextRow = dp[currentIndex + 1];
      const currentProfile = currentProfiles[currentIndex];
      const updatedProfile = updatedProfiles[updatedIndex];
      if (!currentRow || !nextRow || !currentProfile || !updatedProfile) continue;
      const pairScore = (nextRow[updatedIndex + 1] ?? 0) + getPairScore(currentProfile, updatedProfile);
      const removeScore = (nextRow[updatedIndex] ?? 0) + getGapPenalty(currentProfile);
      const addScore = (currentRow[updatedIndex + 1] ?? 0) + getGapPenalty(updatedProfile);
      currentRow[updatedIndex] = Math.max(pairScore, removeScore, addScore);
    }
  }

  const rows: SourceUpdateAlignedRow[] = [];
  let currentIndex = 0;
  let updatedIndex = 0;

  while (currentIndex < currentProfiles.length && updatedIndex < updatedProfiles.length) {
    const currentProfile = currentProfiles[currentIndex];
    const updatedProfile = updatedProfiles[updatedIndex];
    if (!currentProfile || !updatedProfile) break;
    const pairScore = (dp[currentIndex + 1]?.[updatedIndex + 1] ?? 0) + getPairScore(currentProfile, updatedProfile);
    const removeScore = (dp[currentIndex + 1]?.[updatedIndex] ?? 0) + getGapPenalty(currentProfile);
    const addScore = (dp[currentIndex]?.[updatedIndex + 1] ?? 0) + getGapPenalty(updatedProfile);
    const bestScore = dp[currentIndex]?.[updatedIndex] ?? 0;

    if (bestScore === pairScore && pairScore >= removeScore && pairScore >= addScore) {
      rows.push({ currentLine: currentLines[currentIndex] ?? '', updatedLine: updatedLines[updatedIndex] ?? '' });
      currentIndex += 1;
      updatedIndex += 1;
      continue;
    }

    if (bestScore === removeScore && removeScore >= addScore) {
      rows.push({ currentLine: currentLines[currentIndex] ?? '', updatedLine: null });
      currentIndex += 1;
      continue;
    }

    rows.push({ currentLine: null, updatedLine: updatedLines[updatedIndex] ?? '' });
    updatedIndex += 1;
  }

  while (currentIndex < currentLines.length) {
    rows.push({ currentLine: currentLines[currentIndex] ?? '', updatedLine: null });
    currentIndex += 1;
  }
  while (updatedIndex < updatedLines.length) {
    rows.push({ currentLine: null, updatedLine: updatedLines[updatedIndex] ?? '' });
    updatedIndex += 1;
  }

  return rows;
}
