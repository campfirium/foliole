export function isCompletedNonFailureRun(config, run) {
  return run.status === 'completed' && !config.failureConclusions.includes(run.conclusion);
}

function incidentKey(run) {
  return run.headBranch || 'unknown';
}

function ensureIncidents(workflowState) {
  workflowState.incidents ??= {};
  return workflowState.incidents;
}

function runCreatedAt(run) {
  const time = Date.parse(run.createdAt || '');
  return Number.isNaN(time) ? 0 : time;
}

export function markRecoveredIncident(workflowState, run) {
  const incidents = ensureIncidents(workflowState);
  const key = incidentKey(run);
  const existing = incidents[key];
  if (!existing?.active) return;
  incidents[key] = {
    ...existing,
    active: false,
    recoveredAt: new Date().toISOString(),
    recoveredRunCreatedAt: run.createdAt || '',
    recoveredRunId: String(run.databaseId)
  };
}

export function shouldSuppressIncidentFailure(workflowState, run) {
  const incident = ensureIncidents(workflowState)[incidentKey(run)];
  if (!incident) return false;
  if (incident.active) return true;
  if (!incident.recoveredRunCreatedAt) return false;
  return runCreatedAt(run) <= Date.parse(incident.recoveredRunCreatedAt);
}

export function recordIncidentFailure(workflowState, run, event, notified) {
  const incidents = ensureIncidents(workflowState);
  const key = incidentKey(run);
  const existing = incidents[key] ?? {};
  const runId = String(run.databaseId);
  incidents[key] = {
    ...existing,
    active: true,
    branch: run.headBranch || '',
    firstFailureRunId: existing.firstFailureRunId || runId,
    headSha: run.headSha || '',
    lastFailureAt: new Date().toISOString(),
    lastFailureRunCreatedAt: run.createdAt || '',
    lastFailureRunId: runId,
    notifiedDedupeKey: existing.notifiedDedupeKey || (notified ? event.dedupeKey : ''),
    notifiedRunId: existing.notifiedRunId || (notified ? runId : '')
  };
}
