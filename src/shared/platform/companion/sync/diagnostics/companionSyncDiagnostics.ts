import type {
  SyncDiagnosticSnapshot,
  SyncDiagnosticVerdict
} from '../../../../../../lib/platform/syncDiagnosticsContract';
import { fetchDesktopJson } from '../../../companionDesktopSyncHttp';
import { classifyCompanionSyncTimeoutMessage } from '../../../companionSyncTimeoutOwnership';
import { isNativeCompanionSyncDiagnosticsRuntime } from '../../../companionWorkspaceRuntimeRepository';
import { diagnoseIosCompanionDatabase } from '../../runtime/iosCompanionActiveDatabaseDiagnostics';
import { loadCompanionSyncGroup } from '../syncGroupStore';

const SYNC_DIAGNOSTICS_PATH = '/companion/diagnostics/sync';

export interface CombinedSyncDiagnosticResult {
  android: SyncDiagnosticSnapshot | null;
  desktop: SyncDiagnosticSnapshot | null;
  verdicts: SyncDiagnosticVerdict[];
}

function warningVerdict(code: string, message: string, evidence: Record<string, unknown>): SyncDiagnosticVerdict {
  return { code, evidence, message, severity: 'warning' };
}

function infoVerdict(code: string, message: string, evidence: Record<string, unknown>): SyncDiagnosticVerdict {
  return { code, evidence, message, severity: 'info' };
}

export async function loadLocalSyncDiagnostics(): Promise<SyncDiagnosticSnapshot | null> {
  if (!isNativeCompanionSyncDiagnosticsRuntime()) {
    return null;
  }
  return diagnoseIosCompanionDatabase(await loadCompanionSyncGroup());
}

export async function loadDesktopSyncDiagnostics(endpointUrl: string): Promise<SyncDiagnosticSnapshot> {
  return await fetchDesktopJson<SyncDiagnosticSnapshot>(endpointUrl, SYNC_DIAGNOSTICS_PATH);
}

function findLatestFailedTerminalEvent(android: SyncDiagnosticSnapshot) {
  return android.events.find((event) => (
    event.status === 'failed' || event.status === 'completed' || event.status === 'skipped'
  ))?.status === 'failed'
    ? android.events.find((event) => event.status === 'failed') ?? null
	    : null;
}

function recentFailureEvidence(event: NonNullable<ReturnType<typeof findLatestFailedTerminalEvent>>) {
  const timeout = classifyCompanionSyncTimeoutMessage(event.message);
  return {
    message: event.message,
    occurred_at: event.occurred_at,
    timeout_allows_new_run_before_underlying_work_settles:
      timeout?.allowsNewRunBeforeUnderlyingWorkSettles,
    timeout_cancels_underlying_work: timeout?.cancelsUnderlyingWork,
    timeout_key: timeout?.key,
    timeout_owner: timeout?.owner
  };
}

function pushStorageVerdicts(args: {
  android: SyncDiagnosticSnapshot;
  desktop: SyncDiagnosticSnapshot;
  verdicts: SyncDiagnosticVerdict[];
}) {
  if (args.desktop.storage.active_node_count > 0 && args.android.storage.active_node_count === 0) {
    args.verdicts.push(warningVerdict('sync_pack_download_or_apply_breakpoint', 'Desktop has topics but this device has none.', {
      android_node_count: args.android.storage.active_node_count,
      desktop_node_count: args.desktop.storage.active_node_count
    }));
  }
  if (args.desktop.storage.active_node_count > 0 && args.desktop.sync_state.max_state_seq === null) {
    args.verdicts.push(warningVerdict('sync_desktop_missing_node_ledger', 'Desktop topics are not represented in sync state.', {
      desktop_node_count: args.desktop.storage.active_node_count
    }));
  }
}

function pushContentBacklogVerdicts(android: SyncDiagnosticSnapshot, verdicts: SyncDiagnosticVerdict[]) {
  if (android.storage.active_node_count > 0 && android.content.missing_content_blob_count > 0) {
    verdicts.push(infoVerdict('sync_android_content_cache_backlog', 'Some topic bodies are still downloading.', {
      missing_content_blob_count: android.content.missing_content_blob_count,
      missing_external_document_body_count: android.content.missing_external_document_body_count ?? 0,
      missing_topic_body_count: android.content.missing_topic_body_count ?? 0
    }));
  }
  if ((android.content.missing_attachment_resource_count ?? 0) > 0) {
    verdicts.push(infoVerdict('sync_android_attachment_cache_backlog', 'Some attachment files are still downloading.', {
      missing_attachment_resource_count: android.content.missing_attachment_resource_count ?? 0
    }));
  }
}

function pushConflictVerdict(android: SyncDiagnosticSnapshot, verdicts: SyncDiagnosticVerdict[]) {
  const conflictCount = android.sync_state.conflict_count ?? 0;
  if (conflictCount <= 0) return;
  verdicts.push(infoVerdict(
    'sync_conflicts_safely_saved',
    'Conflicting edits were safely saved as separate copies.',
    {
      conflict_count: conflictCount,
      latest_conflict: android.sync_state.recent_conflicts?.[0] ?? null
    }
  ));
}

export function mergeSyncDiagnosticVerdicts(args: {
  android: SyncDiagnosticSnapshot | null;
  desktop: SyncDiagnosticSnapshot | null;
}): SyncDiagnosticVerdict[] {
  const verdicts = [...(args.android?.verdicts ?? []), ...(args.desktop?.verdicts ?? [])];
  if (!args.android || !args.desktop) {
    return verdicts;
  }
  const latestFailed = findLatestFailedTerminalEvent(args.android);
  if (latestFailed) {
    verdicts.push(warningVerdict('sync_recent_android_failure', 'Recent device sync failed.', {
      ...recentFailureEvidence(latestFailed)
    }));
  }
  pushStorageVerdicts({ android: args.android, desktop: args.desktop, verdicts });
  pushConflictVerdict(args.android, verdicts);
  pushContentBacklogVerdicts(args.android, verdicts);
  return verdicts;
}

export async function runCombinedSyncDiagnostics(endpointUrl: string | null): Promise<CombinedSyncDiagnosticResult> {
  const android = await loadLocalSyncDiagnostics();
  const desktop = endpointUrl ? await loadDesktopSyncDiagnostics(endpointUrl) : null;
  return {
    android,
    desktop,
    verdicts: mergeSyncDiagnosticVerdicts({ android, desktop })
  };
}
