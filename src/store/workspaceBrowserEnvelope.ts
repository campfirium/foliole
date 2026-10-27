import { dailyFlowSessionSchema } from '../../lib/core/flow/dailyFlowSessionSchema';
import { browserDailyFlowSchema, emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { captureBrowserReviewBases } from '../shared/platform/runtime/browserReviewProjection';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistoryState';
import { parsePersistedWorkspaceState } from './workspacePersistedStateParser';
import type { WorkspacePersistedState, WorkspaceState } from './workspaceStoreTypes';

export const BROWSER_WORKSPACE_VERSION = 2;
export function readBrowserWorkspaceEnvelope(raw: string): { state: WorkspacePersistedState; version: number } {
  const value = JSON.parse(raw) as { version?: unknown; state?: Record<string, unknown> };
  if ((value.version !== 0 && value.version !== BROWSER_WORKSPACE_VERSION) || !value.state ||
    !Array.isArray(value.state.nodeOrder) || !value.state.nodesById) throw new Error('browser_workspace_format_unknown');
  const parsed = parsePersistedWorkspaceState(value.state);
  if (!parsed.nodesById || !parsed.nodeOrder || !parsed.layout) throw new Error('browser_workspace_format_unknown');
  const session = dailyFlowSessionSchema.parse(value.state.reviewSession);
  const history = value.state.appActionHistory as WorkspaceState['appActionHistory'] | undefined;
  if (history && (!Array.isArray(history.undoStack) || !Array.isArray(history.redoStack))) throw new Error('browser_workspace_history_unknown');
  // Keep legacy history entries intact; their ordinary command reader validates them on replay.
  const flow = value.version === 0 ? { ...captureBrowserReviewBases(emptyBrowserDailyFlow(), parsed.nodesById),
    legacyHistoryIds: [...(history?.undoStack ?? []), ...(history?.redoStack ?? [])].flatMap(entry =>
      entry.type === 'review.grade' ? [entry.id, ...(entry.reviewOpId ? [entry.reviewOpId] : [])] : [])
  } : browserDailyFlowSchema.parse(value.state.browserDailyFlow);

  return { version: BROWSER_WORKSPACE_VERSION, state: { ...parsed, reviewSession: session,
    appActionHistory: history ?? createEmptyWorkspaceActionHistory(), browserDailyFlow: flow } as WorkspacePersistedState };
}
