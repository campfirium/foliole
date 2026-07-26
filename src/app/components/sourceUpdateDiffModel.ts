import type { Chunk } from '@codemirror/merge';
import type { Text } from '@codemirror/state';

import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffLineKind, EditorDiffSpacerLine } from '../../features/editor/adapters/lineDiffDecorations';
import { buildLineClassProfiles, createEmptyDiffDecorations } from '../../features/editor/adapters/lineDiffDecorations';

import {
  createSourceUpdateDiffSnapshot,
  type SourceUpdateDiffSnapshot
} from './sourceUpdateDiffEngine';

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
  current: { decorations: EditorDiffDecorations };
  overviewSegments: SourceUpdateOverviewSegment[];
  totalRows: number;
  updated: { decorations: EditorDiffDecorations };
}

interface ChunkLineRange {
  count: number;
  firstLineNumber: number;
  lines: string[];
}

function getChunkLineRange(doc: Text, from: number, to: number, end: number): ChunkLineRange {
  const anchor = doc.lineAt(Math.min(from, doc.length)).number;
  if (from === to) return { count: 0, firstLineNumber: anchor, lines: [] };
  const lastLineNumber = doc.lineAt(Math.min(end, doc.length)).number;
  const lines = Array.from(
    { length: lastLineNumber - anchor + 1 },
    (_, index) => doc.line(anchor + index).text
  );
  return { count: lines.length, firstLineNumber: anchor, lines };
}

function getChunkRanges(chunk: Chunk, currentDoc: Text, updatedDoc: Text) {
  return {
    current: getChunkLineRange(currentDoc, chunk.fromA, chunk.toA, chunk.endA),
    updated: getChunkLineRange(updatedDoc, chunk.fromB, chunk.toB, chunk.endB)
  };
}

function addLineDecorations(
  target: EditorDiffDecorations,
  range: ChunkLineRange,
  kind: EditorDiffLineKind
) {
  for (let index = 0; index < range.count; index += 1) {
    target.lineDecorations.push({ kind, lineNumber: range.firstLineNumber + index });
  }
}

function createSpacerLines(
  range: ChunkLineRange,
  profiles: ReturnType<typeof buildLineClassProfiles>,
  offset: number
): EditorDiffSpacerLine[] {
  return range.lines.slice(offset).map((text, index) => {
    const lineNumber = range.firstLineNumber + offset + index;
    return { className: profiles[lineNumber - 1]?.className ?? null, lineNumber, text };
  });
}

function addChunkSpacers(args: {
  current: EditorDiffDecorations;
  currentProfiles: ReturnType<typeof buildLineClassProfiles>;
  currentRange: ChunkLineRange;
  updated: EditorDiffDecorations;
  updatedProfiles: ReturnType<typeof buildLineClassProfiles>;
  updatedRange: ChunkLineRange;
}) {
  if (args.currentRange.count < args.updatedRange.count) {
    args.current.spacerDecorations.push({
      beforeLineNumber: args.currentRange.firstLineNumber + args.currentRange.count,
      kind: 'added',
      lines: createSpacerLines(args.updatedRange, args.updatedProfiles, args.currentRange.count)
    });
  }
  if (args.updatedRange.count < args.currentRange.count) {
    args.updated.spacerDecorations.push({
      beforeLineNumber: args.updatedRange.firstLineNumber + args.updatedRange.count,
      kind: 'removed',
      lines: createSpacerLines(args.currentRange, args.currentProfiles, args.updatedRange.count)
    });
  }
}

function getOverviewKind(current: ChunkLineRange, updated: ChunkLineRange): SourceUpdateOverviewKind {
  if (current.count === 0) return 'updated-only';
  if (updated.count === 0) return 'current-only';
  return 'changed';
}

function buildDecorations(snapshot: SourceUpdateDiffSnapshot) {
  const current = createEmptyDiffDecorations();
  const updated = createEmptyDiffDecorations();
  const currentProfiles = buildLineClassProfiles(snapshot.currentDoc.toString().split('\n'));
  const updatedProfiles = buildLineClassProfiles(snapshot.updatedDoc.toString().split('\n'));

  snapshot.chunks.forEach((chunk) => {
    const ranges = getChunkRanges(chunk, snapshot.currentDoc, snapshot.updatedDoc);
    addLineDecorations(current, ranges.current, 'removed');
    addLineDecorations(updated, ranges.updated, 'added');
    addChunkSpacers({
      current,
      currentProfiles,
      currentRange: ranges.current,
      updated,
      updatedProfiles,
      updatedRange: ranges.updated
    });
  });
  return { current, updated };
}

function buildOverview(snapshot: SourceUpdateDiffSnapshot) {
  const overviewSegments: SourceUpdateOverviewSegment[] = [];
  let currentLineCursor = 1;
  let rowCursor = 0;
  let updatedLineCursor = 1;

  snapshot.chunks.forEach((chunk, index) => {
    const ranges = getChunkRanges(chunk, snapshot.currentDoc, snapshot.updatedDoc);
    const unchangedRows = Math.max(
      ranges.current.firstLineNumber - currentLineCursor,
      ranges.updated.firstLineNumber - updatedLineCursor,
      0
    );
    rowCursor += unchangedRows;
    const changedRows = Math.max(ranges.current.count, ranges.updated.count, 1);
    const kind = getOverviewKind(ranges.current, ranges.updated);
    overviewSegments.push({
      currentLineNumber: ranges.current.count > 0 ? ranges.current.firstLineNumber : null,
      endRow: rowCursor + changedRows,
      id: `${kind}-${index}-${rowCursor + 1}`,
      kind,
      row: rowCursor + 1,
      updatedLineNumber: ranges.updated.count > 0 ? ranges.updated.firstLineNumber : null
    });
    rowCursor += changedRows;
    currentLineCursor = ranges.current.firstLineNumber + ranges.current.count;
    updatedLineCursor = ranges.updated.firstLineNumber + ranges.updated.count;
  });

  rowCursor += Math.max(
    snapshot.currentDoc.lines - currentLineCursor + 1,
    snapshot.updatedDoc.lines - updatedLineCursor + 1,
    0
  );
  return { overviewSegments, totalRows: Math.max(rowCursor, 1) };
}

export function buildSourceUpdateDiffModelFromSnapshot(snapshot: SourceUpdateDiffSnapshot): SourceUpdateDiffModel {
  const decorations = buildDecorations(snapshot);
  const overview = buildOverview(snapshot);
  return {
    current: { decorations: decorations.current },
    overviewSegments: overview.overviewSegments,
    totalRows: overview.totalRows,
    updated: { decorations: decorations.updated }
  };
}

export function buildSourceUpdateDiffModel(currentContent: string, updatedContent: string) {
  return buildSourceUpdateDiffModelFromSnapshot(createSourceUpdateDiffSnapshot(currentContent, updatedContent));
}
