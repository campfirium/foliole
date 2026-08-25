import type { DbPort } from '../../lib/core/sync/dbPort';
import { SyncGroupLifecycleStore } from '../../lib/core/sync/syncGroupLifecycleStore';
import {
  parseSyncGroupJoinApplication,
  parseSyncGroupRosterSnapshot,
  parseSyncGroupRouteGrant,
  type SyncGroupJoinApplication
} from '../../lib/platform/syncGroupLifecycleContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';
import { openIosSyncGroupLifecycleAcceptanceDatabase } from
  '../shared/platform/companion/runtime/iosSyncGroupLifecycleAcceptanceDatabaseAdapter';
import {
  discardPreparedSyncGroupJoinIntentKey,
  loadPreparedSyncGroupMemberRoute
} from '../shared/platform/companion/sync/companionSyncGroupAuthorizationPrepare';
import {
  consumePreparedRouteGrant,
  persistPreparedJoinIntent
} from '../shared/platform/companion/sync/companionSyncGroupLifecyclePrepare';

import { acceptanceEndpoint, postResult, type AcceptanceResult } from './iosBridgeAcceptance';

const REQUEST_ID = 'request-ios-lifecycle-acceptance';
const GROUP_ID = 'group-lifecycle-acceptance';
const MANAGER_ID = 'member-manager-acceptance';
const NOW = '2026-08-26T03:00:00.000Z';

export async function runIosSyncGroupLifecycleAcceptance() {
  const database = await openIosSyncGroupLifecycleAcceptanceDatabase();
  let result: AcceptanceResult;
  try {
    result = await runLeg(database.db, database.name);
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error), phase: 'failed',
      scenario: 'sync-group-lifecycle', status: 'failed' };
  }
  await database.close().catch(() => undefined);
  postResult(result);
}

async function runLeg(db: DbPort, databaseName: string): Promise<AcceptanceResult> {
  const store = new SyncGroupLifecycleStore(db);
  const application = await store.loadJoinApplication(REQUEST_ID);
  if (!application) return createWaitingIntent(db, databaseName);
  if (application.state === 'waiting') return submitWaitingIntent(store, application, databaseName);
  if (application.state === 'pending') return consumeApprovedGrant(db, store, application, databaseName);
  throw new Error(`unexpected lifecycle application state: ${application.state}`);
}

async function createWaitingIntent(db: DbPort, databaseName: string): Promise<AcceptanceResult> {
  const application = await persistPreparedJoinIntent(db, {
    created_at: NOW, group_id: GROUP_ID, installation_id: 'installation-ios-lifecycle-acceptance',
    library_facts: { fixture: 'isolated-ios-simulator' }, previous_member_id: null,
    protocol_version: 4, request_id: REQUEST_ID, requested_display_name: 'Lifecycle iPhone',
    requested_platform: 'ios', state: 'waiting', timeline_id: 'timeline-lifecycle-acceptance', updated_at: NOW
  });
  return result('intent-waiting', databaseName, {
    application, manager_contacted: false
  });
}

async function submitWaitingIntent(
  store: SyncGroupLifecycleStore, application: SyncGroupJoinApplication, databaseName: string
): Promise<AcceptanceResult> {
  const response = await requestManager('/v4/join-applications', {
    body: JSON.stringify(application), headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  const managerApplication = parseSyncGroupJoinApplication(response.application);
  const pending = await store.saveJoinApplication({ ...application, state: 'pending', updated_at: NOW });
  return result('waiting-restarted', databaseName, {
    application: pending, manager_application: managerApplication
  });
}

async function consumeApprovedGrant(
  db: DbPort, store: SyncGroupLifecycleStore,
  application: SyncGroupJoinApplication, databaseName: string
): Promise<AcceptanceResult> {
  const response = await requestManager(`/v4/join-applications/${encodeURIComponent(application.request_id)}`);
  const grant = parseSyncGroupRouteGrant(response.grant);
  const roster = parseSyncGroupRosterSnapshot(response.roster);
  const consumed = await consumePreparedRouteGrant(db, grant, roster, MANAGER_ID, NOW);
  const route = await loadPreparedSyncGroupMemberRoute(grant.route_id);
  const discarded = await discardPreparedSyncGroupJoinIntentKey(application.request_id);
  return result('grant-consumed', databaseName, {
    application: await store.loadJoinApplication(application.request_id), grant: consumed.grant,
    intent_key_removed: discarded.discarded === false, roster: consumed.roster, route: route.route
  });
}

function result(phase: AcceptanceResult['phase'], databaseName: string, evidence: Record<string, unknown>) {
  return { ...evidence, database_name: databaseName, error: null, phase,
    production_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    scenario: 'sync-group-lifecycle' as const, status: 'passed' as const };
}

async function requestManager(path: string, init?: RequestInit) {
  const endpoint = acceptanceEndpoint();
  if (!endpoint) throw new Error('lifecycle manager acceptance endpoint is unavailable');
  const response = await fetch(`${endpoint}${path}`, {
    ...init, headers: { ...init?.headers, 'X-Foliole-Lifecycle-Prepare': 't151-prepare-lifecycle-v1' }
  });
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(value.error ?? `manager status ${response.status}`));
  return value;
}
