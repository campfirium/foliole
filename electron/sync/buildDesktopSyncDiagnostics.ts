import type { DesktopSyncDiagnosticsPayload } from '../../lib/platform/desktopSyncDiagnosticsContract.js';
import type { DesktopSyncGroupOverviewPayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import { redactDiagnosticPayload } from '../diagnostics/diagnosticRedactor.js';

import { buildCompanionSyncDiagnostics } from './buildCompanionSyncDiagnostics.js';
import { loadActiveDesktopSyncActivityIds, loadDesktopSyncActivity } from './desktopSyncActivityStore.js';

export function buildDesktopSyncDiagnostics(
  overview: DesktopSyncGroupOverviewPayload,
  appVersion: string | null
): DesktopSyncDiagnosticsPayload {
  const snapshot = { ...buildCompanionSyncDiagnostics({ appVersion, serverStatus: overview.server_status }), events: [] };
  const activity = loadDesktopSyncActivity();
  const activeIds = loadActiveDesktopSyncActivityIds();
  const devices = new Map<string, string>();
  const runs = new Map<string, string>();
  const report = redactDiagnosticPayload({
    collected_at: snapshot.collected_at, app_version: appVersion,
    active_run: activeIds.length > 0,
    sync_enabled: overview.sync_enabled, sync_paused: overview.sync_paused,
    discovery_error: overview.discovery_error, server: overview.server_status,
    storage: snapshot.storage, sync_state: snapshot.sync_state,
    verdicts: snapshot.verdicts,
    activity: activity.map((event) => ({ ...event,
      peer_device_id: alias(devices, event.peer_device_id, 'device'),
      run_id: alias(runs, event.run_id ?? null, 'round'),
      peer_device_name: undefined
    }))
  });
  return { active_run_ids: activeIds, active_run: activeIds.length > 0, activity, overview, snapshot,
    report_text: JSON.stringify(report, null, 2) };
}

function alias(values: Map<string, string>, value: string | null, prefix: string) {
  if (!value) return null;
  if (!values.has(value)) values.set(value, `${prefix}-${values.size + 1}`);
  return values.get(value);
}
