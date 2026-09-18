import type { WorkspaceState } from './workspaceStore';
import { setUndoRouterOwner } from './workspaceUndoRouter';

type WorkspaceUpdate = (state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>;
type WorkspaceSet = (update: WorkspaceUpdate) => void;

// Call only at synchronous acceptance, never at persistence completion or replay.
export function acceptWorkspaceHistoryCommand(
  set: WorkspaceSet,
  ownership: 'workspace' | 'preserve',
  update: WorkspaceUpdate
) {
  let accepted = false;
  set((state) => {
    const patch = update(state);
    const pending = patch.appActionHistory?.pendingAction;
    accepted = Boolean(pending && pending.entry.id !== state.appActionHistory.pendingAction?.entry.id);
    return patch;
  });
  if (accepted && ownership === 'workspace') setUndoRouterOwner('workspace');
}
