import { replayApplicationAnnotation } from './workspaceApplicationAnnotationReplay';
import type { ApplicationOperation, ApplicationReplay } from './workspaceApplicationHistory';
import { replayApplicationText } from './workspaceApplicationTextReplay';
import { replayApplicationWorkspace } from './workspaceApplicationWorkspaceReplay';
import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export async function applyApplicationHistoryEntry(input: {
  operation: ApplicationOperation; request: ApplicationReplay; current: () => boolean; beforeSubmit: () => boolean;
  get: () => WorkspaceState; set: Set; signal?: AbortSignal; context?: EditorOperationApplyContext;
}): Promise<ApplicationOperation | null> {
  const { operation, request, current, beforeSubmit, get, set, context } = input;
  const args = { get, set, ...(input.signal ? { signal: input.signal } : {}), mode: request.direction, isCurrent: current, beforeSubmit };
  if (operation.domain === 'workspace') {
    const entry = await replayApplicationWorkspace({ ...args, entry: operation.entry });
    return entry ? { ...operation, entry } : null;
  }
  if (operation.entry.type !== 'text.edit') {
    const entry = await replayApplicationAnnotation({ ...args, entry: operation.entry });
    return entry ? { ...operation, entry } : null;
  }
  const saved = await replayApplicationText({ ...args, entry: operation.entry, ...(context ? { context } : {}) });
  return saved ? operation : null;
}
