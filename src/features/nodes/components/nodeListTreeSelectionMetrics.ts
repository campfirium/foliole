import { useEffect, useRef } from 'react';

import { markSelectionComputationAt, recordComponentRender } from '../../../shared/platform/performanceDiagnosticsProbe';
import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic
} from '../../../store/workspaceEditorInputDiagnostics';

interface SelectionMetricsArgs {
  activeNodeId: string | null;
  activeRowsLength: number;
  noteRowsAllLength: number;
  noteTreeBuildDurationMs: number;
  trashRowsAllLength: number;
  trashTreeBuildDurationMs: number;
  virtualRowsAllLength: number;
  virtualTreeBuildDurationMs: number;
}

function logNodeListTreeRenderDiagnostic(args: SelectionMetricsArgs) {
  if (!isEditorInputDiagnosticEnabled()) {
    return;
  }
  logEditorInputDiagnostic('node-list-tree-render', {
    activeNodeId: args.activeNodeId,
    activeRowsLength: args.activeRowsLength,
    noteRowsAllLength: args.noteRowsAllLength,
    noteTreeBuildDurationMs: args.noteTreeBuildDurationMs,
    trashRowsAllLength: args.trashRowsAllLength,
    trashTreeBuildDurationMs: args.trashTreeBuildDurationMs,
    virtualRowsAllLength: args.virtualRowsAllLength,
    virtualTreeBuildDurationMs: args.virtualTreeBuildDurationMs
  });
}

export function useNodeListTreeSelectionMetrics(args: SelectionMetricsArgs) {
  const selectionStartedAtRef = useRef(0);
  recordComponentRender('nodeListTree');
  logNodeListTreeRenderDiagnostic(args);

  useEffect(() => {
    selectionStartedAtRef.current = performance.now();
  }, [args.activeNodeId]);

  useEffect(() => {
    if (!args.activeNodeId) {
      return;
    }
    const relativeAtMs = performance.now() - selectionStartedAtRef.current;
    markSelectionComputationAt(
      args.activeNodeId,
      'note_tree_build',
      relativeAtMs,
      args.noteTreeBuildDurationMs,
      `rows:${args.noteRowsAllLength}`
    );
    markSelectionComputationAt(
      args.activeNodeId,
      'trash_tree_build',
      relativeAtMs,
      args.trashTreeBuildDurationMs,
      `rows:${args.trashRowsAllLength}`
    );
    markSelectionComputationAt(
      args.activeNodeId,
      'virtual_tree_build',
      relativeAtMs,
      args.virtualTreeBuildDurationMs,
      `rows:${args.virtualRowsAllLength}`
    );
    markSelectionComputationAt(
      args.activeNodeId,
      'visible_rows_rendered',
      relativeAtMs,
      0,
      `rows:${args.activeRowsLength}`
    );
  }, [
    args.activeNodeId,
    args.activeRowsLength,
    args.noteRowsAllLength,
    args.noteTreeBuildDurationMs,
    args.trashRowsAllLength,
    args.trashTreeBuildDurationMs,
    args.virtualRowsAllLength,
    args.virtualTreeBuildDurationMs
  ]);
}
