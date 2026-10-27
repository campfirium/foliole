import type { WorkspaceNodeSnapshot } from '../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult } from '../../../../lib/core/flow/dailyFlowContract';
import type { DailyFlowFutureArgs, DailyFlowFutureView } from '../../../../lib/core/flow/dailyFlowFuture';
import type { DailyFlowSession } from '../../../../lib/core/flow/dailyFlowSession';
import type { DailyFlowSourceSettingsArgs } from '../../../../lib/core/flow/dailyFlowSourceSettings';
import type { DailyFlowViewArgs, DailyFlowView } from '../../../../lib/core/flow/dailyFlowViewContract';

export interface BrowserDailyFlowRuntime {
  future(args: DailyFlowFutureArgs, knownNodes: Record<string, unknown>): Promise<DailyFlowFutureView>;
  open(args: DailyFlowOpenArgs, knownNodes: Record<string, unknown>): Promise<DailyFlowResult & { nodes?: Record<string, WorkspaceNodeSnapshot> }>;
  commit(args: DailyFlowCommitArgs, knownNodes: Record<string, unknown>): Promise<DailyFlowResult & { nodes?: Record<string, WorkspaceNodeSnapshot> }>;
  view(args: DailyFlowViewArgs, seed: DailyFlowSession, knownNodes: Record<string, unknown>): Promise<{ view: DailyFlowView; nodes?: Record<string, WorkspaceNodeSnapshot> }>;
  saveSourceSettings(args: DailyFlowSourceSettingsArgs, knownNodes: Record<string, unknown>): Promise<boolean>;
}

let browserDailyFlowRuntime: BrowserDailyFlowRuntime | null = null;
export function installBrowserDailyFlowRuntime(value: BrowserDailyFlowRuntime | null) { browserDailyFlowRuntime = value; }
export function getBrowserDailyFlowRuntime() { return browserDailyFlowRuntime; }
