import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffLineKind, EditorDiffSpacerLine } from '../../features/editor/adapters/lineDiffDecorations';
import { buildLineClassProfiles, createEmptyDiffDecorations } from '../../features/editor/adapters/lineDiffDecorations';

import { alignSourceUpdateLines } from './sourceUpdateLineAlignment';

interface SourceUpdateSideDiff {
  decorations: EditorDiffDecorations;
}

export type SourceUpdateOverviewKind = 'changed' | 'current-only' | 'updated-only';

export interface SourceUpdateOverviewSegment {
  currentLineNumber: number | null;
  endRow: number;
  id: string;
  kind: SourceUpdateOverviewKind;
  row: number;
  updatedLineNumber: number | null;
}

export interface SourceUpdateDiffModel {
  current: SourceUpdateSideDiff;
  overviewSegments: SourceUpdateOverviewSegment[];
  totalRows: number;
  updated: SourceUpdateSideDiff;
}

interface UnifiedAlignedRow {
  currentLine: string | null;
  currentLineNumber: number | null;
  updatedLine: string | null;
  updatedLineNumber: number | null;
}

function pushLineDecoration(target: EditorDiffDecorations, lineNumber: number, kind: EditorDiffLineKind) {
  target.lineDecorations.push({ kind, lineNumber });
}

function pushSpacerDecoration(target: EditorDiffDecorations, beforeLineNumber: number, kind: EditorDiffLineKind, lines: EditorDiffSpacerLine[]) {
  if (lines.length === 0) {
    return;
  }
  target.spacerDecorations.push({ beforeLineNumber, kind, lines });
}

function buildUnifiedAlignedRows(currentContent: string, updatedContent: string): UnifiedAlignedRow[] {
  const rawRows = alignSourceUpdateLines(currentContent, updatedContent);
  const rows: UnifiedAlignedRow[] = [];
  const pendingCurrent: UnifiedAlignedRow[] = [];
  const pendingUpdated: UnifiedAlignedRow[] = [];
  let currentLineNumber = 1;
  let updatedLineNumber = 1;

  const flushPending = () => {
    const pairedCount = Math.min(pendingCurrent.length, pendingUpdated.length);

    for (let index = 0; index < pairedCount; index += 1) {
      rows.push({
        currentLine: pendingCurrent[index]?.currentLine ?? null,
        currentLineNumber: pendingCurrent[index]?.currentLineNumber ?? null,
        updatedLine: pendingUpdated[index]?.updatedLine ?? null,
        updatedLineNumber: pendingUpdated[index]?.updatedLineNumber ?? null
      });
    }

    rows.push(...pendingCurrent.slice(pairedCount));
    rows.push(...pendingUpdated.slice(pairedCount));
    pendingCurrent.length = 0;
    pendingUpdated.length = 0;
  };

  rawRows.forEach((row) => {
    if (row.currentLine !== null && row.updatedLine !== null) {
      flushPending();
      rows.push({
        currentLine: row.currentLine,
        currentLineNumber,
        updatedLine: row.updatedLine,
        updatedLineNumber
      });
      currentLineNumber += 1;
      updatedLineNumber += 1;
      return;
    }

    if (row.currentLine !== null) {
      pendingCurrent.push({
        currentLine: row.currentLine,
        currentLineNumber,
        updatedLine: null,
        updatedLineNumber: null
      });
      currentLineNumber += 1;
    }

    if (row.updatedLine !== null) {
      pendingUpdated.push({
        currentLine: null,
        currentLineNumber: null,
        updatedLine: row.updatedLine,
        updatedLineNumber
      });
      updatedLineNumber += 1;
    }
  });

  flushPending();
  return rows;
}

function getOverviewKind(row: UnifiedAlignedRow): SourceUpdateOverviewKind | null {
  if (row.currentLine !== null && row.updatedLine !== null) {
    return row.currentLine === row.updatedLine ? null : 'changed';
  }
  if (row.currentLine !== null) {
    return 'current-only';
  }
  if (row.updatedLine !== null) {
    return 'updated-only';
  }
  return null;
}

function buildOverviewSegments(alignedRows: UnifiedAlignedRow[]): SourceUpdateOverviewSegment[] {
  const segments: SourceUpdateOverviewSegment[] = [];
  let pending: SourceUpdateOverviewSegment | null = null;

  const flushPending = () => {
    if (!pending) {
      return;
    }
    segments.push(pending);
    pending = null;
  };

  alignedRows.forEach((row, index) => {
    const kind = getOverviewKind(row);
    const rowNumber = index + 1;

    if (!kind) {
      flushPending();
      return;
    }

    if (pending && pending.kind === kind && pending.endRow === rowNumber - 1) {
      pending.endRow = rowNumber;
      return;
    }

    flushPending();
    pending = {
      currentLineNumber: row.currentLineNumber,
      endRow: rowNumber,
      id: `${kind}-${rowNumber}`,
      kind,
      row: rowNumber,
      updatedLineNumber: row.updatedLineNumber
    };
  });

  flushPending();
  return segments;
}

export function buildSourceUpdateDiffModel(currentContent: string, updatedContent: string): SourceUpdateDiffModel {
  const alignedRows = buildUnifiedAlignedRows(currentContent, updatedContent);
  const currentProfiles = buildLineClassProfiles(currentContent.split('\n'));
  const updatedProfiles = buildLineClassProfiles(updatedContent.split('\n'));
  const currentDecorations = createEmptyDiffDecorations();
  const updatedDecorations = createEmptyDiffDecorations();
  let pendingCurrentSpacer: EditorDiffSpacerLine[] = [];
  let pendingUpdatedSpacer: EditorDiffSpacerLine[] = [];

  alignedRows.forEach((row) => {
    if (row.currentLine === null && row.updatedLineNumber !== null) {
      const profile = updatedProfiles[row.updatedLineNumber - 1];
      pendingCurrentSpacer.push({ className: profile?.className ?? null, lineNumber: row.updatedLineNumber, text: row.updatedLine ?? '' });
    }

    if (row.updatedLine === null && row.currentLineNumber !== null) {
      const profile = currentProfiles[row.currentLineNumber - 1];
      pendingUpdatedSpacer.push({ className: profile?.className ?? null, lineNumber: row.currentLineNumber, text: row.currentLine ?? '' });
    }

    if (row.currentLine !== null && row.currentLineNumber !== null) {
      pushSpacerDecoration(currentDecorations, row.currentLineNumber, 'added', pendingCurrentSpacer);
      pendingCurrentSpacer = [];

      if (row.updatedLine !== row.currentLine || row.updatedLine === null) {
        pushLineDecoration(currentDecorations, row.currentLineNumber, 'removed');
      }
    }

    if (row.updatedLine !== null && row.updatedLineNumber !== null) {
      pushSpacerDecoration(updatedDecorations, row.updatedLineNumber, 'removed', pendingUpdatedSpacer);
      pendingUpdatedSpacer = [];

      if (row.currentLine !== row.updatedLine || row.currentLine === null) {
        pushLineDecoration(updatedDecorations, row.updatedLineNumber, 'added');
      }
    }
  });

  const currentTailAnchor = alignedRows.filter((row) => row.currentLineNumber !== null).at(-1)?.currentLineNumber ?? 1;
  const updatedTailAnchor = alignedRows.filter((row) => row.updatedLineNumber !== null).at(-1)?.updatedLineNumber ?? 1;

  pushSpacerDecoration(currentDecorations, currentTailAnchor + 1, 'added', pendingCurrentSpacer);
  pushSpacerDecoration(updatedDecorations, updatedTailAnchor + 1, 'removed', pendingUpdatedSpacer);

  return {
    current: { decorations: currentDecorations },
    overviewSegments: buildOverviewSegments(alignedRows),
    totalRows: Math.max(alignedRows.length, 1),
    updated: { decorations: updatedDecorations }
  };
}
