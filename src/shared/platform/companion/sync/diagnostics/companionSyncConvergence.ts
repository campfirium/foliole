import type { SyncDiagnosticEvent, SyncDiagnosticSeverity } from '../../../../../../lib/platform/syncDiagnosticsContract';

import {
  formatRemainingSyncSegments,
  formatSyncConvergenceCount
} from './companionSyncConvergenceFormatting';
import {
  deriveSyncConvergenceStatus,
  type SyncConvergenceStatus
} from './companionSyncConvergenceStatus';
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
  status: SyncConvergenceStatus;
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

export function buildSyncConvergenceReport(result: CombinedSyncDiagnosticResult): SyncConvergenceReport {
  const checks: SyncConvergenceCheck[] = [];
  if (!result.android) {
    checks.push(check('android_diagnostics_missing', 'error', 'Device diagnostics unavailable', 'Run this check inside the companion app.'));
  }
  if (!result.desktop) {
    checks.push(check('desktop_diagnostics_missing', 'error', 'Desktop diagnostics unavailable', 'A paired desktop endpoint is required for convergence.'));
  }
  if (!result.android || !result.desktop) {
    return { checks, status: deriveSyncConvergenceStatus(checks) };
  }
  checks.push(...buildDiagnosticVerdictChecks(result));
  checks.push(...buildLocalStateChecks(result));
  checks.push(...buildEventStateChecks(result));
  checks.push(...buildResourceChecks(result));
  checks.push(...buildCompletedEventChecks(result));
  return { checks, status: deriveSyncConvergenceStatus(checks) };
}

function buildLocalStateChecks(result: CombinedSyncDiagnosticResult) {
  const dirtyCount = result.android?.sync_state.ready_dirty_count ?? result.android?.sync_state.local_dirty_count ?? 0;
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  const pushIssueCount = result.android?.sync_state.push_issue_count ?? 0;
  const checks: SyncConvergenceCheck[] = [];
  if (dirtyCount > 0) {
    checks.push(check(
      'local_dirty_not_converged',
      'warning',
      'Device changes still need to send',
      `${formatSyncConvergenceCount(dirtyCount, 'device change is', 'device changes are')} waiting to send.`
    ));
  }
  if (pendingAckCount > 0) {
    checks.push(buildPendingAckCheck(result));
  }
  if (pushIssueCount > 0) {
    checks.push(check(
      'push_issue_not_converged',
      'warning',
      'Device changes were not sent',
      `${formatSyncConvergenceCount(pushIssueCount, 'device change was', 'device changes were')} rejected or conflicted during push.`
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
      `Sync diagnostic ${verdict.code} needs attention.`
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
      `${formatSyncConvergenceCount(staleCount, 'desktop confirmation remained', 'desktop confirmations remained')} pending after a later sync check.`
    );
  }
  return check(
    'pending_ack_not_confirmed',
    'warning',
    'Desktop confirmations are still pending',
    `${formatSyncConvergenceCount(pendingAckCount, 'desktop confirmation still needs', 'desktop confirmations still need')} to come back from the next topic list sync.`
  );
}

function buildEventStateChecks(result: CombinedSyncDiagnosticResult) {
  const latest = latestEvent(result.android?.events ?? []);
  if (latest?.status !== 'skipped') return [];
  if (!latest.message.includes('need review before')) return [];
  return [check(
    'push_conflict_or_rejection_waiting',
    'warning',
    'Device changes were not sent',
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
      'Topic bodies are still downloading',
      `${formatSyncConvergenceCount(missing, 'topic body file remains', 'topic body files remain')} to download: ${formatSyncConvergenceCount(topicBodies, 'topic', 'topics')}, ${formatSyncConvergenceCount(externalBodies, 'external document', 'external documents')}.`
    ));
  }
  if (missingAttachments > 0) {
    checks.push(check(
      'attachment_backlog_exists',
      'info',
      'Attachment files are still downloading',
      `${formatSyncConvergenceCount(missingAttachments, 'attachment file remains', 'attachment files remain')} to download.`
    ));
  }
  return checks;
}

function buildCompletedEventChecks(result: CombinedSyncDiagnosticResult) {
  const latest = latestEvent(result.android?.events ?? []);
  if (latest?.status !== 'completed') return [];
  const totalDirtyCount = result.android?.sync_state.local_dirty_count ?? 0;
  const dirtyCount = result.android?.sync_state.ready_dirty_count ?? totalDirtyCount;
  const pendingAckCount = result.android?.sync_state.pending_ack_count ?? 0;
  const pushIssueCount = result.android?.sync_state.push_issue_count ?? 0;
  const missingBodies = result.android?.content.missing_content_blob_count ?? 0;
  const missingAttachments = result.android?.content.missing_attachment_resource_count ?? 0;
  if (totalDirtyCount === 0 && pendingAckCount === 0 && pushIssueCount === 0 && missingBodies === 0 && missingAttachments === 0) return [];
  return [check(
    'completed_event_with_local_work',
    'warning',
    'Latest sync check still has work left',
    `A finished sync check was recorded while ${formatRemainingSyncSegments({
      dirtyCount,
      missingAttachments,
      missingBodies,
      pendingAckCount,
      pushIssueCount
    })} were still present.`
  )];
}

export async function runSyncConvergenceCheck(endpointUrl: string | null): Promise<SyncConvergenceResult> {
  const diagnostics = await runCombinedSyncDiagnostics(endpointUrl);
  return {
    diagnostics,
    report: buildSyncConvergenceReport(diagnostics)
  };
}
