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
  checks.push(...buildDiagnosticVerdictChecks(result));
  checks.push(...buildLocalStateChecks(result));
  checks.push(...buildEventStateChecks(result));
  checks.push(...buildStructureChecks(result));
  checks.push(...buildResourceChecks(result));
  checks.push(...buildCompletedEventChecks(result));
  if (checks.length === 0) {
    checks.push(check('sync_converged', 'ok', 'Sync is converged', 'No dirty changes, pending confirmations, structure lag, or body backlog were found.'));
  }
  return { checks, status: deriveStatus(checks) };
}

function buildLocalStateChecks(result: CombinedSyncDiagnosticResult) {
  const dirtyCount = result.android?.sync_state.local_dirty_count ?? 0;
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  const pushIssueCount = result.android?.sync_state.push_issue_count ?? 0;
  const checks: SyncConvergenceCheck[] = [];
  if (dirtyCount > 0) {
    checks.push(check('local_dirty_not_converged', 'warning', 'Device changes still need to send', `${dirtyCount} local change(s) are still dirty.`));
  }
  if (pendingAckCount > 0) {
    checks.push(buildPendingAckCheck(result));
  }
  if (pushIssueCount > 0) {
    checks.push(check(
      'push_issue_not_converged',
      'error',
      'Device changes need review before sending',
      `${pushIssueCount} device change(s) were rejected or conflicted during push.`
    ));
  }
  return checks;
}

function buildDiagnosticVerdictChecks(result: CombinedSyncDiagnosticResult) {
  const seen = new Set<string>();
  const verdicts = [
    ...result.verdicts,
    ...(result.android?.verdicts ?? []),
    ...(result.desktop?.verdicts ?? [])
  ].filter((verdict) => {
    const key = `${verdict.code}:${verdict.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return verdicts
    .filter((verdict) => verdict.severity === 'error')
    .map((verdict) => check(
      `diagnostic_error_${verdict.code}`,
      'error',
      verdict.message,
      `Diagnostic verdict ${verdict.code} is blocking convergence.`
    ));
}

function buildPendingAckCheck(result: CombinedSyncDiagnosticResult) {
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  const pendingAcks = result.android?.sync_state.pending_acks ?? [];
  const finishedEvents = (result.android?.events ?? []).filter((event) => event.status === 'completed' || event.status === 'skipped');
  const staleCount = pendingAcks.filter((ack) => finishedEvents.some((event) => event.occurred_at > ack.acked_at)).length;
  if (staleCount > 0) {
    return check(
      'pending_ack_survived_finished_pass',
      'error',
      'Desktop confirmation was not pulled back',
      `${staleCount} accepted push ack(s) remained pending after a later sync pass finished.`
    );
  }
  return check(
    'pending_ack_not_confirmed',
    'warning',
    'Desktop confirmations are still pending',
    `${pendingAckCount} accepted push ack(s) still need pull confirmation.`
  );
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

function buildEventStateChecks(result: CombinedSyncDiagnosticResult) {
  const latest = latestEvent(result.android?.events ?? []);
  if (latest?.status !== 'skipped') return [];
  if (!latest.message.includes('need review before they can be sent')) return [];
  return [check(
    'push_conflict_or_rejection_waiting',
    'error',
    'Device changes need review before sending',
    latest.message
  )];
}

function buildResourceChecks(result: CombinedSyncDiagnosticResult) {
  const missing = result.android?.content.missing_content_blob_count ?? 0;
  const missingAttachments = result.android?.content.missing_attachment_resource_count ?? 0;
  const checks: SyncConvergenceCheck[] = [];
  if (missing > 0) {
    const topicBodies = result.android?.content.missing_topic_body_count ?? 0;
    const externalBodies = result.android?.content.missing_external_document_body_count ?? 0;
    checks.push(check(
      'content_backlog_exists',
      'info',
      'Topic bodies are still caching',
      `${missing} body blob(s) remain uncached: ${topicBodies} topic, ${externalBodies} external document.`
    ));
  }
  if (missingAttachments > 0) {
    checks.push(check('attachment_backlog_exists', 'info', 'Attachment files are still caching', `${missingAttachments} attachment file(s) remain uncached.`));
  }
  return checks;
}

function buildCompletedEventChecks(result: CombinedSyncDiagnosticResult) {
  const latest = latestEvent(result.android?.events ?? []);
  if (latest?.status !== 'completed') return [];
  const dirtyCount = result.android?.sync_state.local_dirty_count ?? 0;
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  const pushIssueCount = result.android?.sync_state.push_issue_count ?? 0;
  const missingBodies = result.android?.content.missing_content_blob_count ?? 0;
  const missingAttachments = result.android?.content.missing_attachment_resource_count ?? 0;
  const lag = structureLag(result) ?? 0;
  if (dirtyCount === 0 && pendingAckCount === 0 && pushIssueCount === 0 && missingBodies === 0 && missingAttachments === 0 && lag === 0) return [];
  return [check(
    'completed_event_with_local_work',
    'error',
    'Latest finished sync pass is not fully converged',
    `A finished sync pass was recorded while ${dirtyCount} dirty change(s), ${pendingAckCount} pending ack(s), ${pushIssueCount} push issue(s), ${missingBodies} body blob(s), ${missingAttachments} attachment file(s), and ${lag} structure change(s) remain.`
  )];
}

export async function runSyncConvergenceCheck(endpointUrl: string | null): Promise<SyncConvergenceResult> {
  const diagnostics = await runCombinedSyncDiagnostics(endpointUrl);
  return {
    diagnostics,
    report: buildSyncConvergenceReport(diagnostics)
  };
}
