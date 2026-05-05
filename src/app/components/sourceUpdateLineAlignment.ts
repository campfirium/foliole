export interface SourceUpdateAlignedRow {
  currentLine: string | null;
  updatedLine: string | null;
}

function splitIntoLines(content: string) {
  return content.split('\n');
}

export function alignSourceUpdateLines(currentContent: string, updatedContent: string): SourceUpdateAlignedRow[] {
  const currentLines = splitIntoLines(currentContent);
  const updatedLines = splitIntoLines(updatedContent);
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
