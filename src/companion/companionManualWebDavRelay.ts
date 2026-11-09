import type { WebDavRelayBinding } from '../../lib/platform/webDavRelayContract';
import type { CompanionWebDavHttpStats } from '../shared/platform/companion/sync/companionWebDavRelayHttp';
import { companionWebDavRelayLanConnected, runCompanionWebDavRelayRound } from '../shared/platform/companion/sync/companionWebDavRelayRound';
import { loadCompanionWebDavRelay } from '../shared/platform/companion/sync/companionWebDavRelayStore';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { beginNativeCompanionSyncRun } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { writeCompanionSyncActivity } from './companionSyncActivityWrite';
import { refreshCompanionSyncDisplay } from './companionSyncDisplayRefresh';
import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';
import { runCompanionSyncAsOwner } from './companionSyncRunOwner';
import type { ForegroundAutoSyncOutcome, TryForegroundAutoSyncArgs } from './companionWorkspaceSyncFlow';

export async function tryCompanionManualWebDavRelay(args: TryForegroundAutoSyncArgs): Promise<ForegroundAutoSyncOutcome | null> {
  if (args.triggerReason !== 'manual' || args.cancelled()) return null;
  const binding = await loadCompanionWebDavRelay();
  if (!binding || companionWebDavRelayLanConnected(binding)) return null;
  const runId = args.runId ?? createCompanionSyncRunId();
  const run = runCompanionSyncAsOwner('webdav-relay', runId, () => runRelay(args, binding, runId), true);
  args.onRunIdentified?.(run.runId, run.mode);
  return await run.completion as ForegroundAutoSyncOutcome;
}

export async function runCompanionManualWebDavAfterLanFailure(args: TryForegroundAutoSyncArgs, runId: string,
  peerId: string | undefined, error: unknown): Promise<ForegroundAutoSyncOutcome | null> {
  if (args.triggerReason !== 'manual' || args.cancelled() || !peerId) return null;
  const detail = formatCompanionSyncFailureMessage(error);
  if (!/\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ConnectException|SocketTimeoutException)\b|failed to connect|network is unreachable/iu.test(detail)) {
    return null;
  }
  const binding = await loadCompanionWebDavRelay();
  if (binding?.desktop_device_id !== peerId || companionWebDavRelayLanConnected(binding)) return null;
  return runRelay(args, binding, runId);
}

async function runRelay(args: TryForegroundAutoSyncArgs, binding: WebDavRelayBinding, runId: string): Promise<ForegroundAutoSyncOutcome> {
  if (companionWebDavRelayLanConnected(binding)) return 'pending';
  const startedAt = args.triggeredAt ?? new Date().toISOString();
  const activity = { endpointUrl: null, runId, startedAt, triggerReason: 'manual' as const };
  const stats: CompanionWebDavHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const progress = { published: 0, applied: 0, retries: 0 };
  const started = performance.now();
  let failure: string | undefined;
  args.setStatus('syncing');
  args.setError(null);
  try {
    await beginNativeCompanionSyncRun('manual', runId);
    await writeCompanionSyncActivity({ ...activity, kind: 'run_started', status: 'started', message: 'WebDAV relay started.' }, args.setError);
    await runCompanionWebDavRelayRound(binding, stats, progress, args.signal);
  } catch (error) {
    failure = formatCompanionSyncFailureMessage(error);
  }
  if (progress.applied) await refreshCompanionSyncDisplay(args).catch(() => args.setError('sync_display_unavailable'));
  const result = args.cancelled() ? 'cancelled' : failure ? 'failed' : 'completed';
  const message = `WebDAV relay ${JSON.stringify({ ...stats, ...progress, elapsedMs: Math.round(performance.now() - started) })}`;
  const state = await writeCompanionSyncActivity({ ...activity, kind: 'run_finished', result, message,
    status: result === 'cancelled' ? 'skipped' : result }, args.setError);
  if (state) args.setState(current => ({ ...current, ...state }));
  if (failure) args.setError(failure);
  args.setStatus('idle');
  return result === 'cancelled' ? 'skipped' : result;
}
