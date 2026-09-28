import {
  encodeSyncPackFactClaims,
  probeSyncPackFactPresence,
  type SyncPackFactIndex
} from '../../../../../../lib/core/sync/syncPackFactPresence';
import { fetchDesktopJson } from '../../../companionDesktopSyncHttp';
import { createSignedRequestHeaders } from '../../network/signedRequest';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

export async function prepareCompanionSyncPackFactRequest(url: string) {
  const requested = new URL(url);
  const endpointUrl = requested.origin;
  const factsPath = requested.pathname.replace(/\/sync-pack$/u, '/sync-pack-facts') + requested.search;
  const index = await fetchDesktopJson<SyncPackFactIndex>(endpointUrl, factsPath);
  if (index.from_state_seq !== Number(requested.searchParams.get('after_state_seq') ?? '0') ||
      (requested.searchParams.has('frontier_state_seq') &&
       index.frontier_state_seq !== Number(requested.searchParams.get('frontier_state_seq'))) ||
      (requested.searchParams.has('source_epoch') &&
       index.source_epoch !== requested.searchParams.get('source_epoch'))) {
    throw new Error('sync_pack_fact_index_changed');
  }
  const claims = await getIosCompanionDatabaseOwner().read((db) =>
    probeSyncPackFactPresence(db, index));
  const bits = encodeSyncPackFactClaims(index, claims);
  requested.searchParams.set('frontier_state_seq', String(index.frontier_state_seq));
  requested.searchParams.set('source_epoch', index.source_epoch);
  requested.searchParams.set('fact_index_id', index.index_id);
  requested.searchParams.set('to_state_seq', String(index.to_state_seq));
  requested.searchParams.set('have_v', bits.versions);
  requested.searchParams.set('have_p', bits.parents);
  requested.searchParams.set('have_r', bits.reviews);
  const pathWithQuery = `${requested.pathname}${requested.search}`;
  return {
    factClaims: { index, claims },
    headers: await createSignedRequestHeaders({ endpointUrl, method: 'GET', pathWithQuery }),
    url: requested.toString()
  };
}
