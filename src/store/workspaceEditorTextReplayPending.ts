import type { EditorTextHistoryReplayResult } from '../features/editor/model/editorOperationHistory';

import { applyWorkspaceTextHistory } from './workspaceEditorTextHistory';
import type { WorkspaceState } from './workspaceStoreTypes';

export function createPendingEditorTextReplays(get: () => WorkspaceState, settle: (nodeId: string, saved: boolean) => void) {
  let scope: WorkspaceState['libraryScope'];
  const pending = new Map<string, Pick<EditorTextHistoryReplayResult, 'persistence' | 'save'>>();
  const checkScope = () => {
    if (scope === get().libraryScope) return;
    scope = get().libraryScope;
    pending.clear();
  };
  return {
    has(nodeId: string) {
      checkScope();
      const replay = pending.get(nodeId);
      if (replay?.save?.status === 'failed') replay.save.retry();
      return Boolean(replay);
    },
    apply(args: Parameters<typeof applyWorkspaceTextHistory>[0]) {
      const applied = applyWorkspaceTextHistory(args);
      if (typeof applied !== 'object') return applied ? 'applied' as const : 'failed' as const;
      track(args.nodeId, applied);
      return 'pending' as const;
    }
  };
  function track(nodeId: string, result: Pick<EditorTextHistoryReplayResult, 'persistence' | 'save'>) {
    checkScope();
    const submittedScope = scope;
    pending.set(nodeId, result);
    void result.persistence!.then(saved => {
      if (submittedScope !== get().libraryScope || pending.get(nodeId) !== result) return;
      pending.delete(nodeId);
      settle(nodeId, saved);
    });
  }
}
