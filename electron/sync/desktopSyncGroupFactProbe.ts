import {
  encodeSyncPackFactClaims,
  probeSyncPackFactPresence,
  type SyncPackFactIndex
} from '../../lib/core/sync/syncPackFactPresence.js';
import { clearSyncPackKnownFactClaims, loadActiveSyncPackFactRound,
  stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';

interface PagedFacts {
  source_view_id: string;
  index: SyncPackFactIndex;
  next: { kind: string; key: string; ordinal: number } | null;
  complete: boolean;
}

interface ReadyFacts {
  source_view_id: string; complete: true; ready: true;
  from_state_seq: number; to_state_seq: number; frontier_state_seq: number; source_epoch: string;
}

export async function prepareDesktopSyncPackFactRequest(args: {
  after: number;
  endpointUrl: string;
  frontierStateSeq?: number;
  groupId: string;
  localDeviceId: string;
  sourcePeerId: string;
  pathWithQuery: string;
  secret: string;
  sourceEpoch?: string;
}) {
  const requested = new URL(`${args.endpointUrl}${args.pathWithQuery}`);
  const facts = new URL(requested);
  facts.pathname = facts.pathname.replace(/\/sync-pack$/u, '/sync-pack-facts');
  const scope = { groupId: args.groupId, peerId: args.sourcePeerId };
  const active = await runWithDatabaseConnectionOwner(() =>
    loadActiveSyncPackFactRound(createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
      ...scope, fromStateSeq: args.after }));
  const savedWindowRebased = alignSavedFactWindow(requested, facts, active);
  let response: SyncPackFactIndex | PagedFacts | ReadyFacts;
  let roundRebased = Boolean(savedWindowRebased);
  try { response = await fetchFacts(args, facts); }
  catch (error) {
    if (!String(error).includes('sync_group_http_409:sync_pack_source_view_unavailable')) throw error;
    if (active) await runWithDatabaseConnectionOwner(() => clearSyncPackKnownFactClaims(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
        ...scope, sourceViewId: active.sourceViewId }));
    for (const key of ['fact_view', 'frontier_state_seq', 'source_epoch']) facts.searchParams.delete(key);
    for (const key of ['frontier_state_seq', 'source_epoch']) requested.searchParams.delete(key);
    response = await fetchFacts(args, facts);
    roundRebased = true;
  }
  if ('source_view_id' in response) return {
    ...await preparePagedFacts(args, requested, response, scope), roundRebased
  };
  const index = response;
  if (index.from_state_seq !== args.after ||
      (requested.searchParams.has('frontier_state_seq') &&
        index.frontier_state_seq !== Number(requested.searchParams.get('frontier_state_seq'))) ||
      (requested.searchParams.has('source_epoch') &&
        index.source_epoch !== requested.searchParams.get('source_epoch'))) {
    throw new Error('sync_pack_fact_index_changed');
  }
  const claims = await runWithDatabaseConnectionOwner(() =>
    probeSyncPackFactPresence(createBetterSqliteDbPort(openDatabaseConnection().sqlite), index));
  const bits = encodeSyncPackFactClaims(index, claims);
  requested.searchParams.set('frontier_state_seq', String(index.frontier_state_seq));
  requested.searchParams.set('source_epoch', index.source_epoch);
  requested.searchParams.set('fact_index_id', index.index_id);
  requested.searchParams.set('to_state_seq', String(index.to_state_seq));
  requested.searchParams.set('have_v', bits.versions);
  requested.searchParams.set('have_p', bits.parents);
  requested.searchParams.set('have_r', bits.reviews);
  return { pathWithQuery: requested.pathname + requested.search,
    factClaims: { index, claims }, roundRebased };
}

function alignSavedFactWindow(requested: URL, facts: URL,
  active: Awaited<ReturnType<typeof loadActiveSyncPackFactRound>>) {
  if (!active || (requested.searchParams.has('source_epoch') &&
      requested.searchParams.get('source_epoch') !== active.window.source_epoch)) return false;
  const rebased = requested.searchParams.has('frontier_state_seq') &&
    Number(requested.searchParams.get('frontier_state_seq')) !== active.window.frontier_state_seq;
  for (const url of [requested, facts]) {
    url.searchParams.set('frontier_state_seq', String(active.window.frontier_state_seq));
    url.searchParams.set('source_epoch', active.window.source_epoch);
  }
  facts.searchParams.set('fact_view', active.sourceViewId);
  return rebased;
}

function fetchFacts(args: Parameters<typeof prepareDesktopSyncPackFactRequest>[0], url: URL) {
  return fetchDesktopWorkgroupJson<SyncPackFactIndex | PagedFacts | ReadyFacts>({
    endpointUrl: args.endpointUrl, groupId: args.groupId,
    localDeviceId: args.localDeviceId, pathWithQuery: url.pathname + url.search,
    secret: args.secret
  });
}

async function preparePagedFacts(args: Parameters<typeof prepareDesktopSyncPackFactRequest>[0],
  requested: URL, first: PagedFacts | ReadyFacts, scope: { groupId: string; peerId: string }) {
  let page: PagedFacts | ReadyFacts = first;
  const window = 'index' in first ? first.index : first;
  let previousId = '';
  for (;;) {
    if ('ready' in page) break;
    const index = page.index;
    if (page.source_view_id !== first.source_view_id || index.index_id === previousId ||
        index.from_state_seq !== args.after || index.to_state_seq !== window.to_state_seq ||
        index.frontier_state_seq !== window.frontier_state_seq ||
        index.source_epoch !== window.source_epoch) throw new Error('sync_pack_fact_index_changed');
    const claims = await runWithDatabaseConnectionOwner(() => stageSyncPackKnownFactClaims(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
        ...scope, sourceViewId: first.source_view_id }, index));
    const bits = encodeSyncPackFactClaims(index, claims);
    const next = new URL(requested);
    next.pathname = next.pathname.replace(/\/sync-pack$/u, '/sync-pack-facts');
    next.searchParams.set('fact_view', first.source_view_id);
    next.searchParams.set('fact_index_id', index.index_id);
    next.searchParams.set('have_v', bits.versions);
    next.searchParams.set('have_p', bits.parents);
    next.searchParams.set('have_r', bits.reviews);
    previousId = index.index_id;
    const response = await fetchFacts(args, next);
    if (!('source_view_id' in response)) throw new Error('sync_pack_fact_index_changed');
    page = response;
  }
  if (page.source_view_id !== first.source_view_id ||
      page.from_state_seq !== window.from_state_seq || page.to_state_seq !== window.to_state_seq ||
      page.frontier_state_seq !== window.frontier_state_seq ||
      page.source_epoch !== window.source_epoch) throw new Error('sync_pack_fact_index_changed');
  requested.searchParams.set('fact_view', first.source_view_id);
  requested.searchParams.set('source_epoch', window.source_epoch);
  requested.searchParams.set('frontier_state_seq', String(window.frontier_state_seq));
  requested.searchParams.set('to_state_seq', String(window.to_state_seq));
  return { pathWithQuery: requested.pathname + requested.search, factClaims: undefined };
}
