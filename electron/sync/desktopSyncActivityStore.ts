import { randomUUID } from 'node:crypto';

import type { DesktopSyncActivityEvent } from '../../lib/platform/desktopSyncDiagnosticsContract.js';
import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { redactDiagnosticValue } from '../diagnostics/diagnosticRedactor.js';

import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

const SETTING_KEY = 'sync_group_activity';
const MAX_RUNS = 100;
const MAX_EVENTS = 1000;
const activeRunIds = new Set<string>();

export function loadActiveDesktopSyncActivityIds() {
  return [...activeRunIds];
}

export interface DesktopSyncActivityContext {
  runId: string;
  reason?: SyncTriggerReason;
  startedAt: string;
}

export function recordDesktopSyncNoPeer(reason: SyncTriggerReason) {
  return recordDesktopSyncActivity({ runId: randomUUID(), reason, startedAt: new Date().toISOString() }, {
    direction: 'local', kind: 'run_finished', message: 'No available device', result: 'waiting',
    stage: 'run', status: 'skipped'
  });
}

export function loadDesktopSyncActivity(): DesktopSyncActivityEvent[] {
  const value = loadJsonSetting(SETTING_KEY);
  return Array.isArray(value) ? value.filter((event): event is DesktopSyncActivityEvent => Boolean(
    event && typeof event.id === 'string' && typeof event.run_id === 'string' &&
    typeof event.occurred_at === 'string' && typeof event.message === 'string'
  )) : [];
}

export async function recordDesktopSyncActivity(
  context: DesktopSyncActivityContext,
  event: Pick<DesktopSyncActivityEvent, 'direction' | 'kind' | 'message' | 'stage' | 'status'> &
    Partial<Pick<DesktopSyncActivityEvent, 'confirmation' | 'record_count' | 'result'>>,
  peer?: Pick<DesktopSyncGroupPeer, 'peer_device_id' | 'peer_device_name'>
) {
  if (event.kind === 'run_started') activeRunIds.add(context.runId);
  if (event.kind === 'run_finished') activeRunIds.delete(context.runId);
  try {
    await runWithDatabaseConnectionOwner(() => {
      const entry: DesktopSyncActivityEvent = {
        ...event, endpoint_url: null, id: randomUUID(), occurred_at: new Date().toISOString(),
        message: String(redactDiagnosticValue(event.message)).slice(0, 2048),
        peer_device_id: peer?.peer_device_id ?? null, peer_device_name: peer ? peer.peer_device_name || loadDesktopSyncGroup()?.devices?.find(
          (device) => device.device_identity_key === peer.peer_device_id)?.device_name || null : null,
        run_id: context.runId, started_at: context.startedAt,
        ...(context.reason ? { trigger_reason: context.reason } : {})
      };
      const runs = new Set<string>();
      const activity = [entry, ...loadDesktopSyncActivity()].filter((item) => {
        if (runs.has(item.run_id!)) return true;
        if (runs.size >= MAX_RUNS) return false;
        runs.add(item.run_id!);
        return true;
      }).slice(0, MAX_EVENTS);
      saveJsonSetting(SETTING_KEY, activity);
    });
  } catch {
    console.warn('[sync] could not save sync activity');
  }
}
