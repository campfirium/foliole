import type {
  SyncDiagnosticSnapshot,
  SyncDiagnosticVerdict
} from '../../../../../../lib/platform/syncDiagnosticsContract';
import { fetchDesktopJson } from '../../../companionDesktopSyncHttp';
import { getCompanionRuntimeCapability } from '../../../companionRuntimeCapabilities';
import { classifyCompanionSyncTimeoutMessage } from '../../../companionSyncTimeoutOwnership';
import {
  FolioleCompanionSync,
  isNativeCompanionSyncDiagnosticsRuntime
} from '../../../companionWorkspaceRuntimeRepository';
import { diagnoseIosCompanionDatabase } from '../../runtime/iosCompanionActiveDatabaseDiagnostics';

const SYNC_DIAGNOSTICS_PATH = '/companion/diagnostics/sync';

export interface CombinedSyncDiagnosticResult {
  android: SyncDiagnosticSnapshot | null;
  desktop: SyncDiagnosticSnapshot | null;
  verdicts: SyncDiagnosticVerdict[];
}

export interface SyncDiagnosticLaggingObjectType {
  object_type: string;
  cursor_lag: number;
  max_state_seq: number;
}

function okVerdict(code: string, message: string, evidence: Record<string, unknown>): SyncDiagnosticVerdict {
  return { code, evidence, message, severity: 'ok' };
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
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return diagnoseIosCompanionDatabase(await FolioleCompanionSync.loadPairingState());
  }
  return await FolioleCompanionSync.diagnoseSync();
}

export async function loadDesktopSyncDiagnostics(endpointUrl: string): Promise<SyncDiagnosticSnapshot> {
  return await fetchDesktopJson<SyncDiagnosticSnapshot>(endpointUrl, SYNC_DIAGNOSTICS_PATH);
}

export function findLaggingDesktopObjectTypes(args: {
  desktop: SyncDiagnosticSnapshot | null;
  packCursor: number | null | undefined;
}): SyncDiagnosticLaggingObjectType[] {
  const packCursor = args.packCursor;
  if (!args.desktop || typeof packCursor !== 'number') {
    return [];
  }
  return args.desktop.sync_state.state_counts
    .flatMap((row) => {
      const maxStateSeq = row.max_state_seq;
      if (typeof maxStateSeq !== 'number' || maxStateSeq <= packCursor) {
        return [];
      }
      return [{
        object_type: row.object_type,
        cursor_lag: maxStateSeq - packCursor,
        max_state_seq: maxStateSeq
      }];
    })
    .sort((left, right) => right.max_state_seq - left.max_state_seq);
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

function pushSyncLagVerdicts(args: {
  android: SyncDiagnosticSnapshot;
  cursorLag: number;
  desktop: SyncDiagnosticSnapshot;
  desktopMaxSeq: number;
  verdicts: SyncDiagnosticVerdict[];
}) {
  if (args.cursorLag > 0) {
    args.verdicts.push(infoVerdict('sync_android_not_caught_up', 'New desktop changes are available for this device.', {
      android_pack_cursor: args.android.sync_state.pack_cursor ?? 0,
      cursor_lag: args.cursorLag,
      desktop_max_state_seq: args.desktopMaxSeq,
      lagging_object_types: findLaggingDesktopObjectTypes({
        desktop: args.desktop,
        packCursor: args.android.sync_state.pack_cursor
      })
    }));
  }
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

function pushAlignedVerdict(args: {
  android: SyncDiagnosticSnapshot;
  androidCursor: number;
  desktopMaxSeq: number;
  verdicts: SyncDiagnosticVerdict[];
}) {
  if (args.desktopMaxSeq <= 0 || args.desktopMaxSeq !== args.androidCursor || args.android.storage.active_node_count <= 0) {
    return;
  }
  args.verdicts.push(okVerdict('sync_structure_aligned', 'Structure sync is aligned.', {
    missing_attachment_resource_count: args.android.content.missing_attachment_resource_count ?? 0,
    missing_content_blob_count: args.android.content.missing_content_blob_count,
    missing_external_document_body_count: args.android.content.missing_external_document_body_count ?? 0,
    missing_topic_body_count: args.android.content.missing_topic_body_count ?? 0,
    state_seq: args.desktopMaxSeq
  }));
}

export function mergeSyncDiagnosticVerdicts(args: {
  android: SyncDiagnosticSnapshot | null;
  desktop: SyncDiagnosticSnapshot | null;
}): SyncDiagnosticVerdict[] {
  const verdicts = [...(args.android?.verdicts ?? []), ...(args.desktop?.verdicts ?? [])];
  if (!args.android || !args.desktop) {
    return verdicts;
  }
  const androidCursor = args.android.sync_state.pack_cursor ?? 0;
  const desktopMaxSeq = args.desktop.sync_state.max_state_seq ?? 0;
  const cursorLag = Math.max(0, desktopMaxSeq - androidCursor);
  const latestFailed = findLatestFailedTerminalEvent(args.android);
  if (latestFailed) {
    verdicts.push(warningVerdict('sync_recent_android_failure', 'Recent device sync failed.', {
      ...recentFailureEvidence(latestFailed)
    }));
  }
  pushSyncLagVerdicts({ android: args.android, cursorLag, desktop: args.desktop, desktopMaxSeq, verdicts });
  pushConflictVerdict(args.android, verdicts);
  pushContentBacklogVerdicts(args.android, verdicts);
  pushAlignedVerdict({ android: args.android, androidCursor, desktopMaxSeq, verdicts });
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
