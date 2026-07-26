import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EditorAdapter, EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';

import {
  updateSourceUpdateDiffSnapshot,
  type SourceUpdateDiffSnapshot
} from './sourceUpdateDiffEngine';
import { buildSourceUpdateDiffModelFromSnapshot } from './sourceUpdateDiffModel';

const DIFF_SETTLE_DELAY_MS = 300;

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

export function useSourceUpdateDiffModel(args: {
  currentContent: string;
  currentEditor: EditorAdapter | null;
  enabled: boolean;
  updatedContent: string;
  updatedEditor: EditorAdapter | null;
}) {
  const snapshotRef = useRef<SourceUpdateDiffSnapshot | null>(null);
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

  return {
    currentMeasuredHighlights: useMemo(
      () => withMeasuredSpacerHeights(diffModel.current.decorations, args.updatedEditor),
      [args.updatedEditor, diffModel.current.decorations]
    ),
    diffModel,
    lineHighlights: {
      current: diffModel.current.decorations,
      updated: diffModel.updated.decorations
    },
    updatedMeasuredHighlights: useMemo(
      () => withMeasuredSpacerHeights(diffModel.updated.decorations, args.currentEditor),
      [args.currentEditor, diffModel.updated.decorations]
    )
  };
}
