import type { SyncDiagnosticEvent, SyncDiagnosticSeverity } from '../../../lib/platform/syncDiagnosticsContract';

import {
  runCombinedSyncDiagnostics,
  type CombinedSyncDiagnosticResult
} from './companionSyncDiagnostics';

export interface SyncConvergenceCheck {
  code: string;
  detail: string;
  severity: SyncDiagnosticSeverity;
  title: string;
}

export interface SyncConvergenceReport {
  checks: SyncConvergenceCheck[];
  status: 'blocked' | 'converged' | 'pending' | 'unknown';
}

export interface SyncConvergenceResult {
  diagnostics: CombinedSyncDiagnosticResult;
  report: SyncConvergenceReport;
}

function latestEvent(events: SyncDiagnosticEvent[]) {
  return [...events].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0] ?? null;
}

function check(
  code: string,
  severity: SyncDiagnosticSeverity,
  title: string,
  detail: string
): SyncConvergenceCheck {
  return { code, detail, severity, title };
}

function structureLag(result: CombinedSyncDiagnosticResult) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return null;
  return Math.max(0, desktopSeq - cursor);
}

function deriveStatus(checks: SyncConvergenceCheck[]): SyncConvergenceReport['status'] {
  if (checks.some((item) => item.severity === 'error')) return 'blocked';
  if (checks.some((item) => item.severity === 'warning' || item.severity === 'info')) return 'pending';
  if (checks.every((item) => item.severity === 'ok')) return 'converged';
  return 'unknown';
}

export function buildSyncConvergenceReport(result: CombinedSyncDiagnosticResult): SyncConvergenceReport {
  const checks: SyncConvergenceCheck[] = [];
  if (!result.android) {
    checks.push(check('android_diagnostics_missing', 'error', 'Android diagnostics unavailable', 'Run this check inside the Android companion app.'));
  }
  if (!result.desktop) {
    checks.push(check('desktop_diagnostics_missing', 'error', 'Desktop diagnostics unavailable', 'A paired desktop endpoint is required for convergence.'));
  }
  if (!result.android || !result.desktop) {
    return { checks, status: deriveStatus(checks) };
  }
  checks.push(...buildLocalStateChecks(result));
  checks.push(...buildStructureChecks(result));
  checks.push(...buildContentChecks(result));
  checks.push(...buildCompletedEventChecks(result));
  if (checks.length === 0) {
    checks.push(check('sync_converged', 'ok', 'Sync is converged', 'No dirty changes, pending confirmations, structure lag, or body backlog were found.'));
  }
  return { checks, status: deriveStatus(checks) };
}

function buildLocalStateChecks(result: CombinedSyncDiagnosticResult) {
  const dirtyCount = result.android?.sync_state.local_dirty_count ?? 0;
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  const checks: SyncConvergenceCheck[] = [];
  if (dirtyCount > 0) {
    checks.push(check('local_dirty_not_converged', 'warning', 'Device changes still need to send', `${dirtyCount} local change(s) are still dirty.`));
  }
  if (pendingAckCount > 0) {
    checks.push(check('pending_ack_not_confirmed', 'warning', 'Desktop confirmations are still pending', `${pendingAckCount} accepted push ack(s) still need pull confirmation.`));
  }
  return checks;
}

function buildStructureChecks(result: CombinedSyncDiagnosticResult) {
  const lag = structureLag(result);
  if (lag == null) {
    return [check('structure_lag_unknown', 'warning', 'Structure convergence is unknown', 'Android cursor or desktop state sequence is missing.')];
  }
  return lag > 0
    ? [check('structure_lag_exists', 'info', 'Desktop structure changes are still available', `${lag} desktop state change(s) have not reached Android.`)]
    : [];
}

function buildContentChecks(result: CombinedSyncDiagnosticResult) {
  const missing = result.android?.content.missing_content_blob_count ?? 0;
  return missing > 0
    ? [check('content_backlog_exists', 'info', 'Topic bodies are still caching', `${missing} topic body blob(s) remain uncached.`)]
    : [];
}

function buildCompletedEventChecks(result: CombinedSyncDiagnosticResult) {
  const latest = latestEvent(result.android?.events ?? []);
  if (latest?.status !== 'completed') return [];
  const dirtyCount = result.android?.sync_state.local_dirty_count ?? 0;
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  if (dirtyCount === 0 && pendingAckCount === 0) return [];
  return [check(
    'completed_event_with_local_work',
    'error',
    'Latest completed event is not fully converged',
    `Completed was recorded while ${dirtyCount} dirty change(s) and ${pendingAckCount} pending ack(s) remain.`
  )];
}

export async function runSyncConvergenceCheck(endpointUrl: string | null): Promise<SyncConvergenceResult> {
  const diagnostics = await runCombinedSyncDiagnostics(endpointUrl);
  return {
    diagnostics,
    report: buildSyncConvergenceReport(diagnostics)
  };
}
