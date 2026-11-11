import { isRetryableWebDavSendError } from '../../lib/core/sync/webDavTransportRetry';
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

export async function tryCompanionWebDavRelay(args: TryForegroundAutoSyncArgs): Promise<ForegroundAutoSyncOutcome | null> {
  if ((args.triggerReason !== 'manual' && !args.scheduledWebDav) || args.cancelled()) return null;
  const binding = await loadCompanionWebDavRelay(args.scheduledWebDav);
  if (!binding || args.cancelled() || companionWebDavRelayLanConnected(binding)) return null;
  const runId = args.runId ?? createCompanionSyncRunId();
  const run = runCompanionSyncAsOwner('webdav-relay', runId, () => runRelay(args, binding, runId), args.triggerReason === 'manual');
  args.onRunIdentified?.(run.runId, run.mode);
  return await run.completion as ForegroundAutoSyncOutcome;
}

export async function runCompanionWebDavAfterLanFailure(args: TryForegroundAutoSyncArgs, runId: string,
  peerId: string | undefined, error: unknown): Promise<ForegroundAutoSyncOutcome | null> {
  if ((args.triggerReason !== 'manual' && !args.scheduledWebDav) || args.cancelled() || !peerId) return null;
  const detail = formatCompanionSyncFailureMessage(error);
  if (!/\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ConnectException|SocketTimeoutException)\b|failed to connect|network is unreachable/iu.test(detail)) {
    return null;
  }
  const binding = await loadCompanionWebDavRelay(args.scheduledWebDav);
  if (binding?.desktop_device_id !== peerId || args.cancelled() || companionWebDavRelayLanConnected(binding)) return null;
  return runRelay(args, binding, runId);
}

async function runRelay(args: TryForegroundAutoSyncArgs, binding: WebDavRelayBinding, runId: string): Promise<ForegroundAutoSyncOutcome> {
  if (args.cancelled()) return 'skipped';
  if (companionWebDavRelayLanConnected(binding)) return 'pending';
  const startedAt = args.triggeredAt ?? new Date().toISOString();
  const triggerReason = args.triggerReason === 'manual' ? 'manual' : 'automatic';
  const activity = { endpointUrl: null, runId, startedAt, triggerReason } as const;
  const stats: CompanionWebDavHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const progress = { published: 0, applied: 0, retries: 0 };
  const started = performance.now();
  let failure: string | undefined;
  args.setStatus('syncing');
  args.setError(null);
  try {
    await beginNativeCompanionSyncRun(triggerReason, runId);
    await writeCompanionSyncActivity({ ...activity, kind: 'run_started', status: 'started', message: 'WebDAV relay started.' }, args.setError);
    await runCompanionWebDavRelayRound(binding, stats, progress, args.signal);
  } catch (error) {
    failure = formatCompanionSyncFailureMessage(error);
    if (!args.cancelled() && error instanceof Error && isRetryableWebDavSendError(error)) {
      args.onRetryableWebDavFailure?.(error);
    }
  }
  if (progress.applied) await refreshCompanionSyncDisplay(args).catch(() => args.setError('sync_display_unavailable'));
  const result = args.cancelled() ? 'cancelled' : failure ? 'failed' : 'completed';
  const errorCode = failure && /^webdav_relay_[a-z0-9_:]+$/iu.test(failure) ? failure : undefined;
  const message = `WebDAV relay ${JSON.stringify({ ...stats, ...progress,
    elapsedMs: Math.round(performance.now() - started), errorCode })}`;
  const state = await writeCompanionSyncActivity({ ...activity, kind: 'run_finished', result, message,
    status: result === 'cancelled' ? 'skipped' : result }, args.setError);
  if (state) args.setState(current => ({ ...current, ...state }));
  if (failure && result !== 'cancelled') args.setError(failure);
  args.setStatus('idle');
  return result === 'cancelled' ? 'skipped' : result;
}
