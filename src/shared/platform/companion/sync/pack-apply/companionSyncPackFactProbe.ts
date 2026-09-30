import {
  encodeSyncPackFactClaims,
  probeSyncPackFactPresence,
  type SyncPackFactIndex
} from '../../../../../../lib/core/sync/syncPackFactPresence';
import { clearSyncPackKnownFactClaims, loadActiveSyncPackFactRound,
  stageSyncPackKnownFactClaims } from '../../../../../../lib/core/sync/syncPackKnownFactClaims';
import { DesktopSyncHttpError, fetchDesktopJson } from '../../../companionDesktopSyncHttp';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { createSignedRequestHeaders } from '../../network/signedRequest';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

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

export async function prepareCompanionSyncPackFactRequest(url: string, scope?: {
  groupId: string; peerId: string;
}) {
  const requested = new URL(url);
  const endpointUrl = requested.origin;
  const active = scope ? await getIosCompanionDatabaseOwner().read((db) =>
    loadActiveSyncPackFactRound(db, { ...scope,
      fromStateSeq: Number(requested.searchParams.get('after_state_seq') ?? '0') })) : null;
  const savedWindowRebased = alignSavedFactWindow(requested, active);
  const facts = new URL(requested);
  facts.pathname = facts.pathname.replace(/\/sync-pack$/u, '/sync-pack-facts');
  if (active) facts.searchParams.set('fact_view', active.sourceViewId);
  let response: SyncPackFactIndex | PagedFacts | ReadyFacts;
  let roundRebased = savedWindowRebased;
  try {
    response = await fetchDesktopJson<SyncPackFactIndex | PagedFacts | ReadyFacts>(endpointUrl,
      facts.pathname + facts.search);
  } catch (error) {
    if (!isUnavailableFactView(error)) throw error;
    if (active && scope) await runCompanionSyncWriterTask(() =>
      getIosCompanionDatabaseOwner().runWriter((db) =>
        clearSyncPackKnownFactClaims(db, { ...scope, sourceViewId: active.sourceViewId })));
    requested.searchParams.delete('frontier_state_seq');
    requested.searchParams.delete('source_epoch');
    facts.searchParams.delete('fact_view');
    facts.searchParams.delete('frontier_state_seq');
    facts.searchParams.delete('source_epoch');
    response = await fetchDesktopJson<SyncPackFactIndex | PagedFacts>(endpointUrl,
      facts.pathname + facts.search);
    roundRebased = true;
  }
  if ('source_view_id' in response) {
    if (!scope) throw new Error('sync_pack_fact_scope_missing');
    return { ...await preparePagedFactRequest(requested, response, scope), roundRebased };
  }
  return prepareSingleFactRequest(requested, response, roundRebased);
}

async function prepareSingleFactRequest(requested: URL, index: SyncPackFactIndex,
  roundRebased: boolean) {
  const endpointUrl = requested.origin;
  if (index.from_state_seq !== Number(requested.searchParams.get('after_state_seq') ?? '0') ||
      (requested.searchParams.has('frontier_state_seq') &&
       index.frontier_state_seq !== Number(requested.searchParams.get('frontier_state_seq'))) ||
      (requested.searchParams.has('source_epoch') &&
       index.source_epoch !== requested.searchParams.get('source_epoch'))) {
    throw new Error('sync_pack_fact_index_changed');
  }
  const claims = await getIosCompanionDatabaseOwner().read(async (db) =>
    requested.searchParams.has('restore_id') ? { versions: [], parents: [], reviews: [] }
      : probeSyncPackFactPresence(db, index));
  const bits = encodeSyncPackFactClaims(index, claims);
  requested.searchParams.set('frontier_state_seq', String(index.frontier_state_seq));
  requested.searchParams.set('source_epoch', index.source_epoch);
  requested.searchParams.set('fact_index_id', index.index_id);
  if (index.round_source_view_id) {
    requested.searchParams.set('round_source_view_id', index.round_source_view_id);
  }
  requested.searchParams.set('to_state_seq', String(index.to_state_seq));
  requested.searchParams.set('have_v', bits.versions);
  requested.searchParams.set('have_p', bits.parents);
  requested.searchParams.set('have_r', bits.reviews);
  const pathWithQuery = `${requested.pathname}${requested.search}`;
  return {
    factClaims: { index, claims },
    headers: await createSignedRequestHeaders({ endpointUrl, method: 'GET', pathWithQuery }),
    roundRebased,
    url: requested.toString()
  };
}

function alignSavedFactWindow(requested: URL,
  active: Awaited<ReturnType<typeof loadActiveSyncPackFactRound>>) {
  if (!active || (requested.searchParams.has('source_epoch') &&
      requested.searchParams.get('source_epoch') !== active.window.source_epoch)) return false;
  const rebased = requested.searchParams.has('frontier_state_seq') &&
    Number(requested.searchParams.get('frontier_state_seq')) !== active.window.frontier_state_seq;
  requested.searchParams.set('frontier_state_seq', String(active.window.frontier_state_seq));
  requested.searchParams.set('source_epoch', active.window.source_epoch);
  return rebased;
}

async function preparePagedFactRequest(requested: URL, first: PagedFacts | ReadyFacts,
  scope: { groupId: string; peerId: string }) {
  const endpointUrl = requested.origin;
  let page: PagedFacts | ReadyFacts = first;
  const window = 'index' in first ? first.index : first;
  let previousId = '';
  for (;;) {
    if ('ready' in page) break;
    const { index } = page;
    if (page.source_view_id !== first.source_view_id || index.index_id === previousId ||
        index.from_state_seq !== Number(requested.searchParams.get('after_state_seq') ?? '0') ||
        index.to_state_seq !== window.to_state_seq ||
        index.frontier_state_seq !== window.frontier_state_seq ||
        index.source_epoch !== window.source_epoch) {
      throw new Error('sync_pack_fact_index_changed');
    }
    const claims = await runCompanionSyncWriterTask(() =>
      getIosCompanionDatabaseOwner().runWriter((db) => stageSyncPackKnownFactClaims(db, {
        ...scope, sourceViewId: first.source_view_id,
        ...(requested.searchParams.has('restore_id')
          ? { restoreId: requested.searchParams.get('restore_id')! } : {}) }, index)));
    const bits = encodeSyncPackFactClaims(index, claims);
    const next = new URL(requested);
    next.pathname = next.pathname.replace(/\/sync-pack$/u, '/sync-pack-facts');
    next.searchParams.set('fact_view', first.source_view_id);
    next.searchParams.set('fact_index_id', index.index_id);
    next.searchParams.set('have_v', bits.versions);
    next.searchParams.set('have_p', bits.parents);
    next.searchParams.set('have_r', bits.reviews);
    previousId = index.index_id;
    page = await fetchDesktopJson<PagedFacts | ReadyFacts>(endpointUrl,
      next.pathname + next.search);
  }
  if (page.source_view_id !== first.source_view_id ||
      page.from_state_seq !== window.from_state_seq || page.to_state_seq !== window.to_state_seq ||
      page.frontier_state_seq !== window.frontier_state_seq ||
      page.source_epoch !== window.source_epoch) throw new Error('sync_pack_fact_index_changed');
  requested.searchParams.set('fact_view', first.source_view_id);
  requested.searchParams.set('source_epoch', window.source_epoch);
  requested.searchParams.set('frontier_state_seq', String(window.frontier_state_seq));
  requested.searchParams.set('to_state_seq', String(window.to_state_seq));
  return { url: requested.toString(), factClaims: undefined,
    headers: await createSignedRequestHeaders({ endpointUrl, method: 'GET',
      pathWithQuery: requested.pathname + requested.search }) };
}

function isUnavailableFactView(error: unknown) {
  if (!(error instanceof DesktopSyncHttpError) || error.status !== 409) return false;
  try { return (JSON.parse(error.body) as { error?: string }).error === 'sync_pack_source_view_unavailable'; }
  catch { return false; }
}
