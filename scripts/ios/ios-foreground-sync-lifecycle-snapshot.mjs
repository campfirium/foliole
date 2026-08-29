import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';
import { waitForAcceptanceObservation } from './ios-simulator-acceptance-runner.mjs';

export const RECOVERED_RESUME_ADMISSION_TIMEOUT_MS = 60_000;
export const RECOVERED_RESUME_SETTLEMENT_TIMEOUT_MS = 30_000;

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
  const countsPassed = phases['endpoint-ready'] === 1 && phases['resume-single-flight'] === 1 &&
    phases['failed-resume'] === 1 + backgroundRetryCount && phases['recovered-resume'] === 1 &&
    (phases.restart === 1 || phases.restart === 2);
  const requestPassed = hostedProviderLifecyclePassed(args.observations) && countsPassed &&
    observations.max_concurrency === 1 &&
    observations.active_requests === 0 && observations.failed_requests === 1 + backgroundRetryCount &&
    observations.completed_requests === 4 + restartExtraCount &&
    observations.request_count === 5 + backgroundRetryCount + restartExtraCount;
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

export async function waitForRecoveredResumeRequest({
  read, waitForObservation = waitForAcceptanceObservation
}) {
  const admission = await waitForObservation({
    accept: (value) => recoveredRequests(value).length >= 1 || lifecycle(value).max_concurrency > 1,
    describe: describeRecoveredResume,
    initialObservation: 'recovered-resume request was not admitted',
    label: 'recovered-resume request admission', read,
    timeoutMs: RECOVERED_RESUME_ADMISSION_TIMEOUT_MS
  });
  const admitted = recoveredRequests(admission);
  if (admitted.length !== 1 || lifecycle(admission).max_concurrency !== 1) {
    throw new Error('recovered-resume request admission was not single-flight.');
  }
  const startedAt = admitted[0].started_at;
  const settled = await waitForObservation({
    accept: (value) => {
      const requests = recoveredRequests(value);
      const request = requests.find((item) => item.started_at === startedAt);
      return requests.length !== 1 || lifecycle(value).max_concurrency > 1 || request?.status !== 'running';
    },
    describe: describeRecoveredResume,
    initialObservation: 'admitted recovered-resume request was still running',
    label: 'recovered-resume request settlement', read,
    timeoutMs: RECOVERED_RESUME_SETTLEMENT_TIMEOUT_MS
  });
  const requests = recoveredRequests(settled);
  const request = requests.find((item) => item.started_at === startedAt);
  if (requests.length !== 1 || lifecycle(settled).max_concurrency !== 1 ||
      lifecycle(settled).active_requests !== 0 || request?.status !== 'passed' || !request.finished_at) {
    throw new Error('recovered-resume request did not settle as one passed request.');
  }
  return settled;
}

function lifecycle(value) { return value.foreground_sync_lifecycle; }
function recoveredRequests(value) { return lifecycle(value).requests.filter((item) => item.phase === 'recovered-resume'); }
function describeRecoveredResume(value) {
  const state = lifecycle(value);
  return `requests=${recoveredRequests(value).length}, active=${state.active_requests}, max=${state.max_concurrency}`;
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
