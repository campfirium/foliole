export interface SourceUpdateSummaryItem {
  addedLineCount: number;
  endLine: number;
  removedLineCount: number;
  startLine: number;
}

export interface SourceUpdateDisplayLine {
  isChanged: boolean;
  lineNumber: number;
  text: string;
}

export interface SourceUpdateDiffResult {
  changeCount: number;
  lines: SourceUpdateDisplayLine[];
  summary: SourceUpdateSummaryItem[];
}

interface DiffOp {
  kind: 'added' | 'removed' | 'unchanged';
  text: string;
}

const MAX_DP_CELLS = 1_000_000;

function splitLines(value: string) {
  return value.split('\n');
}

function buildFallbackOps(currentLines: string[], updatedLines: string[]) {
  let prefix = 0;
  while (prefix < currentLines.length && prefix < updatedLines.length && currentLines[prefix] === updatedLines[prefix]) {
    prefix += 1;
  }

  let currentSuffix = currentLines.length - 1;
  let updatedSuffix = updatedLines.length - 1;
  while (currentSuffix >= prefix && updatedSuffix >= prefix && currentLines[currentSuffix] === updatedLines[updatedSuffix]) {
    currentSuffix -= 1;
    updatedSuffix -= 1;
  }

  const ops: DiffOp[] = [];
  currentLines.slice(0, prefix).forEach((text) => ops.push({ kind: 'unchanged', text }));
  currentLines.slice(prefix, currentSuffix + 1).forEach((text) => ops.push({ kind: 'removed', text }));
  updatedLines.slice(prefix, updatedSuffix + 1).forEach((text) => ops.push({ kind: 'added', text }));
  currentLines.slice(currentSuffix + 1).forEach((text) => ops.push({ kind: 'unchanged', text }));
  return ops;
}

function buildLcsOps(currentLines: string[], updatedLines: string[]) {
  const rowCount = currentLines.length + 1;
  const columnCount = updatedLines.length + 1;
  if (rowCount * columnCount > MAX_DP_CELLS) {
    return buildFallbackOps(currentLines, updatedLines);
  }

  const dp = Array.from({ length: rowCount }, () => new Uint32Array(columnCount));

  for (let currentIndex = currentLines.length - 1; currentIndex >= 0; currentIndex -= 1) {
    for (let updatedIndex = updatedLines.length - 1; updatedIndex >= 0; updatedIndex -= 1) {
      if (currentLines[currentIndex] === updatedLines[updatedIndex]) {
        dp[currentIndex][updatedIndex] = dp[currentIndex + 1][updatedIndex + 1] + 1;
        continue;
      }
      dp[currentIndex][updatedIndex] = Math.max(dp[currentIndex + 1][updatedIndex], dp[currentIndex][updatedIndex + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let currentIndex = 0;
  let updatedIndex = 0;
  while (currentIndex < currentLines.length && updatedIndex < updatedLines.length) {
    if (currentLines[currentIndex] === updatedLines[updatedIndex]) {
      ops.push({ kind: 'unchanged', text: currentLines[currentIndex] });
      currentIndex += 1;
      updatedIndex += 1;
      continue;
    }
    if (dp[currentIndex + 1][updatedIndex] >= dp[currentIndex][updatedIndex + 1]) {
      ops.push({ kind: 'removed', text: currentLines[currentIndex] });
      currentIndex += 1;
      continue;
    }
    ops.push({ kind: 'added', text: updatedLines[updatedIndex] });
    updatedIndex += 1;
  }

  while (currentIndex < currentLines.length) {
    ops.push({ kind: 'removed', text: currentLines[currentIndex] });
    currentIndex += 1;
  }
  while (updatedIndex < updatedLines.length) {
    ops.push({ kind: 'added', text: updatedLines[updatedIndex] });
    updatedIndex += 1;
  }

  return ops;
}

function summarizeOps(ops: DiffOp[]): SourceUpdateDiffResult {
  const lines: SourceUpdateDisplayLine[] = [];
  const summary: SourceUpdateSummaryItem[] = [];
  let updatedLineNumber = 0;
  let pending: SourceUpdateSummaryItem | null = null;

  const flushPending = () => {
    if (!pending) {
      return;
    }
    summary.push(pending);
    pending = null;
  };

  ops.forEach((op) => {
    if (op.kind === 'unchanged') {
      flushPending();
      updatedLineNumber += 1;
      lines.push({ isChanged: false, lineNumber: updatedLineNumber, text: op.text });
      return;
    }

    const anchorLine = updatedLineNumber + 1;
    if (!pending) {
      pending = {
        addedLineCount: 0,
        endLine: Math.max(1, anchorLine),
        removedLineCount: 0,
        startLine: Math.max(1, anchorLine)
      };
    }

    if (op.kind === 'removed') {
      pending.removedLineCount += 1;
      return;
    }

    updatedLineNumber += 1;
    pending.addedLineCount += 1;
    pending.endLine = updatedLineNumber;
    lines.push({ isChanged: true, lineNumber: updatedLineNumber, text: op.text });
  });

  flushPending();

  return {
    changeCount: summary.length,
    lines,
    summary
  };
}

export function buildSourceUpdateDiff(currentContent: string, updatedContent: string): SourceUpdateDiffResult {
  return summarizeOps(buildLcsOps(splitLines(currentContent), splitLines(updatedContent)));
}
