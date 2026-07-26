import type { Text } from '@codemirror/state';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EditorAdapter, EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';

import {
  updateSourceUpdateDiffSnapshot,
  type SourceUpdateDiffSnapshot
} from './sourceUpdateDiffEngine';
import { buildSourceUpdateDiffModelFromSnapshot } from './sourceUpdateDiffModel';

const DIFF_SETTLE_DELAY_MS = 300;
const MEASURED_SPACER_MIN_HEIGHT_PX = 1;

function useSettledComparisonContent(currentContent: string, updatedContent: string) {
  const [settled, setSettled] = useState({ currentContent, updatedContent });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled({ currentContent, updatedContent });
    }, DIFF_SETTLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentContent, updatedContent]);
  return settled;
}

function withMeasuredSpacerHeights(
  decorations: EditorDiffDecorations | null,
  sourceEditor: EditorAdapter | null
): EditorDiffDecorations | null {
  if (!decorations) return null;
  return {
    lineDecorations: decorations.lineDecorations,
    spacerDecorations: decorations.spacerDecorations.map((spacer) => ({
      ...spacer,
      ...(sourceEditor
        ? { measuredHeightPx: spacer.lines.reduce((total, line) => total + sourceEditor.getLineBlockHeight(line.lineNumber), 0) }
        : {})
    }))
  };
}

interface ChunkLineSpan {
  count: number;
  firstLineNumber: number;
}

function getChunkLineSpan(doc: Text, from: number, to: number, end: number): ChunkLineSpan {
  const firstLineNumber = doc.lineAt(Math.min(from, doc.length)).number;
  if (from === to) return { count: 0, firstLineNumber };
  const lastLineNumber = doc.lineAt(Math.min(end, doc.length)).number;
  return { count: lastLineNumber - firstLineNumber + 1, firstLineNumber };
}

function sumLineBlockHeights(editor: EditorAdapter, span: ChunkLineSpan) {
  let height = 0;
  for (let index = 0; index < span.count; index += 1) {
    height += editor.getLineBlockHeight(span.firstLineNumber + index);
  }
  return height;
}

function buildMeasuredChunkSpacers(args: {
  currentEditor: EditorAdapter;
  snapshot: SourceUpdateDiffSnapshot;
  updatedEditor: EditorAdapter;
}): { current: EditorDiffDecorations['spacerDecorations']; updated: EditorDiffDecorations['spacerDecorations'] } {
  const current: EditorDiffDecorations['spacerDecorations'] = [];
  const updated: EditorDiffDecorations['spacerDecorations'] = [];
  args.snapshot.chunks.forEach((chunk) => {
    const currentSpan = getChunkLineSpan(args.snapshot.currentDoc, chunk.fromA, chunk.toA, chunk.endA);
    const updatedSpan = getChunkLineSpan(args.snapshot.updatedDoc, chunk.fromB, chunk.toB, chunk.endB);
    const currentHeight = sumLineBlockHeights(args.currentEditor, currentSpan);
    const updatedHeight = sumLineBlockHeights(args.updatedEditor, updatedSpan);
    const heightDelta = Math.ceil(Math.abs(currentHeight - updatedHeight));
    if (heightDelta < MEASURED_SPACER_MIN_HEIGHT_PX) {
      return;
    }
    if (currentHeight < updatedHeight) {
      current.push({
        beforeLineNumber: currentSpan.firstLineNumber + currentSpan.count,
        kind: 'added',
        lines: [],
        measuredHeightPx: heightDelta
      });
      return;
    }
    updated.push({
      beforeLineNumber: updatedSpan.firstLineNumber + updatedSpan.count,
      kind: 'removed',
      lines: [],
      measuredHeightPx: heightDelta
    });
  });
  return { current, updated };
}

function withMeasuredChunkAlignment(args: {
  currentDecorations: EditorDiffDecorations;
  currentEditor: EditorAdapter | null;
  snapshot: SourceUpdateDiffSnapshot;
  updatedDecorations: EditorDiffDecorations;
  updatedEditor: EditorAdapter | null;
}) {
  if (!args.currentEditor || !args.updatedEditor) {
    return {
      current: withMeasuredSpacerHeights(args.currentDecorations, args.updatedEditor),
      updated: withMeasuredSpacerHeights(args.updatedDecorations, args.currentEditor)
    };
  }
  const spacers = buildMeasuredChunkSpacers({
    currentEditor: args.currentEditor,
    snapshot: args.snapshot,
    updatedEditor: args.updatedEditor
  });
  return {
    current: { lineDecorations: args.currentDecorations.lineDecorations, spacerDecorations: spacers.current },
    updated: { lineDecorations: args.updatedDecorations.lineDecorations, spacerDecorations: spacers.updated }
  };
}

export function useSourceUpdateDiffModel(args: {
  currentContent: string;
  currentEditor: EditorAdapter | null;
  enabled: boolean;
  updatedContent: string;
  updatedEditor: EditorAdapter | null;
}) {
  const snapshotRef = useRef<SourceUpdateDiffSnapshot | null>(null);
  const [measurementTick, setMeasurementTick] = useState(0);
  const comparedUpdatedContent = args.enabled ? args.updatedContent : args.currentContent;
  const settled = useSettledComparisonContent(args.currentContent, comparedUpdatedContent);
  const snapshot = useMemo(
    () => updateSourceUpdateDiffSnapshot(
      snapshotRef.current,
      settled.currentContent,
      settled.updatedContent
    ),
    [settled]
  );
  useLayoutEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const diffModel = useMemo(() => buildSourceUpdateDiffModelFromSnapshot(snapshot), [snapshot]);
  useLayoutEffect(() => {
    if (!args.enabled || !args.currentEditor || !args.updatedEditor) {
      return;
    }
    const frame = window.requestAnimationFrame(() => setMeasurementTick((tick) => tick + 1));
    return () => window.cancelAnimationFrame(frame);
  }, [args.currentEditor, args.enabled, args.updatedEditor, snapshot]);
  const measuredHighlights = useMemo(() => {
    void measurementTick;
    return withMeasuredChunkAlignment({
      currentDecorations: diffModel.current.decorations,
      currentEditor: args.currentEditor,
      snapshot,
      updatedDecorations: diffModel.updated.decorations,
      updatedEditor: args.updatedEditor
    });
  }, [args.currentEditor, args.updatedEditor, diffModel.current.decorations, diffModel.updated.decorations, measurementTick, snapshot]);

  return {
    currentMeasuredHighlights: measuredHighlights.current,
    diffModel,
    lineHighlights: {
      current: diffModel.current.decorations,
      updated: diffModel.updated.decorations
    },
    updatedMeasuredHighlights: measuredHighlights.updated
  };
}
