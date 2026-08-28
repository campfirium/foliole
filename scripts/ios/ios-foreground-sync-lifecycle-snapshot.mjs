export function parseForegroundSyncLifecycleSnapshot(output) {
  const values = Object.fromEntries(JSON.parse(output || '[]').map(({ key, value }) => [key, value]));
  const events = parseJson(values.workspace_sync_events, []);
  const finishedRuns = events.filter((event) => event.kind === 'run_finished').map(parseFinishedRun);
  return {
    cursor: integerOrNull(values.sync_pack_cursor),
    deviceId: stringOrNull(values.device_id),
    endpoint: stringOrNull(values.workspace_sync_endpoint_url),
    lastSyncedAt: stringOrNull(values.workspace_sync_last_synced_at),
    finishedRuns,
    latestFinished: finishedRuns[0] ?? null
  };
}

export function verifyForegroundSyncLifecycleAcceptance(args) {
  const observations = args.observations.foreground_sync_lifecycle;
  const phases = observations.phase_requests;
  const backgroundRetryCount = args.backgroundDeltas[2];
  const restartExtraCount = Math.max(0, (phases.restart ?? 0) - 1);
  const backgroundPassed = args.backgroundDeltas.length === 3 && args.backgroundDeltas[0] === 0 &&
    args.backgroundDeltas[1] === 0 && (backgroundRetryCount === 0 || backgroundRetryCount === 1);
  const countsPassed = phases['endpoint-ready'] === 2 && phases['resume-single-flight'] === 1 &&
    phases['failed-resume'] === 1 + backgroundRetryCount && phases['recovered-resume'] === 1 &&
    (phases.restart === 1 || phases.restart === 2);
  const requestPassed = hostedProviderLifecyclePassed(args.observations) && countsPassed &&
    observations.max_concurrency === 1 &&
    observations.active_requests === 0 && observations.failed_requests === 1 + backgroundRetryCount &&
    observations.completed_requests === 5 + restartExtraCount &&
    observations.request_count === 6 + backgroundRetryCount + restartExtraCount;
  const lifecyclePassed = backgroundPassed &&
    args.lifecycle.pause_count >= 2 && args.lifecycle.active_count >= 2 && args.lifecycle.resume_count >= 2;
  const snapshotsPassed = isForegroundSyncLifecycleSnapshotSettled(args.beforeRestart) &&
    isForegroundSyncLifecycleSnapshotSettled(args.afterRestart) &&
    args.afterRestart.deviceId === args.beforeRestart.deviceId &&
    args.afterRestart.endpoint === args.beforeRestart.endpoint &&
    args.afterRestart.cursor === args.beforeRestart.cursor &&
    Date.parse(args.afterRestart.lastSyncedAt) >= Date.parse(args.beforeRestart.lastSyncedAt) &&
    args.afterRestart.finishedRuns.some((run) => run.runId === args.beforeRestart.latestFinished.runId);
  if (!requestPassed || !lifecyclePassed || !snapshotsPassed) {
    throw new Error('iOS foreground sync lifecycle acceptance evidence is incomplete.');
  }
  return {
    after_restart: args.afterRestart,
    background_retry_request_count: backgroundRetryCount,
    background_request_deltas: args.backgroundDeltas,
    before_restart: args.beforeRestart,
    lifecycle: args.lifecycle,
    observations,
    restart_extra_request_count: restartExtraCount
  };
}

function parseFinishedRun(event) {
  return {
    message: event.message ?? null,
    occurredAt: event.occurred_at ?? null,
    result: event.result ?? null,
    runId: event.run_id ?? null,
    status: event.status ?? null,
    summary: event.summary ?? null
  };
}

export function isForegroundSyncLifecycleSnapshotSettled(snapshot) {
  const finished = snapshot.latestFinished;
  const finishedWithoutFailure = finished?.runId && typeof finished.result === 'string' &&
    !['failed', 'retrying', 'waiting'].includes(finished.result) &&
    ['completed', 'skipped'].includes(finished.status);
  return Boolean(snapshot.deviceId && snapshot.endpoint && snapshot.lastSyncedAt &&
    snapshot.cursor !== null && snapshot.cursor >= 0 && finishedWithoutFailure);
}

export function assertForegroundSyncLifecycleRequestPhase(observations, phase, count) {
  if (observations.phase_requests[phase] !== count || observations.active_requests !== 0) {
    throw new Error(`${phase} did not remain a single settled sync pass.`);
  }
}

function integerOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function parseJson(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';
