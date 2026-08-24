export type CompanionManualSyncAction = {
  runId: string;
  started: boolean;
  status: 'running' | 'starting' | 'terminal';
  terminalResult: 'completed' | 'failed' | null;
};

export function startCompanionManualSyncAction(runId: string): CompanionManualSyncAction {
  return { runId, started: true, status: 'starting', terminalResult: null };
}

export function markCompanionManualSyncActionRunning(
  action: CompanionManualSyncAction
): CompanionManualSyncAction {
  return { ...action, started: true, status: 'running' };
}

export function finishCompanionManualSyncAction(
  action: CompanionManualSyncAction,
  terminalResult: NonNullable<CompanionManualSyncAction['terminalResult']>
): CompanionManualSyncAction {
  return { ...action, status: 'terminal', terminalResult };
}
