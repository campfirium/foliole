import type { EditorAnnotationOperationEntry } from '../features/editor/model/editorOperationHistoryTypes';

import { startEditorAnnotationHistoryMutation } from './workspaceEditorAnnotationHistoryMutation';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export function replayApplicationAnnotation(args: {
  entry: EditorAnnotationOperationEntry; mode: 'undo' | 'redo'; set: Set; get: () => WorkspaceState;
  beforeSubmit: () => boolean; isCurrent: () => boolean;
}) {
  const active = args.get().activeNodeId;
  let committed: EditorAnnotationOperationEntry | undefined;
  let mayNavigate = false;
  return new Promise<EditorAnnotationOperationEntry | null>(resolve => {
    startEditorAnnotationHistoryMutation({ ...args,
      onCommitted: result => {
        committed = result.entry;
        mayNavigate = args.isCurrent() && args.get().activeNodeId === active;
      },
      onSettled: () => {
        if (committed && mayNavigate && args.isCurrent() &&
          (args.get().activeNodeId === active || args.get().activeNodeId === null)) args.get().setActiveNode(args.entry.nodeId);
        resolve(committed ?? null);
      }
    });
  });
}
