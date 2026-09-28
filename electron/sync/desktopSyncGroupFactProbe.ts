import {
  encodeSyncPackFactClaims,
  probeSyncPackFactPresence,
  type SyncPackFactIndex
} from '../../lib/core/sync/syncPackFactPresence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';

export async function prepareDesktopSyncPackFactRequest(args: {
  after: number;
  endpointUrl: string;
  frontierStateSeq?: number;
  groupId: string;
  localDeviceId: string;
  pathWithQuery: string;
  secret: string;
  sourceEpoch?: string;
}) {
  const factsPath = args.pathWithQuery.replace('/companion/sync-pack?', '/companion/sync-pack-facts?');
  const index = await fetchDesktopWorkgroupJson<SyncPackFactIndex>({
    endpointUrl: args.endpointUrl, groupId: args.groupId,
    localDeviceId: args.localDeviceId, pathWithQuery: factsPath,
    secret: args.secret
  });
  if (index.from_state_seq !== args.after ||
      (args.frontierStateSeq !== undefined && index.frontier_state_seq !== args.frontierStateSeq) ||
      (args.sourceEpoch && index.source_epoch !== args.sourceEpoch)) {
    throw new Error('sync_pack_fact_index_changed');
  }
  const claims = await runWithDatabaseConnectionOwner(() =>
    probeSyncPackFactPresence(createBetterSqliteDbPort(openDatabaseConnection().sqlite), index));
  const bits = encodeSyncPackFactClaims(index, claims);
  const fixedRound = args.pathWithQuery.includes('frontier_state_seq=') ? '' :
    `&frontier_state_seq=${index.frontier_state_seq}&source_epoch=${encodeURIComponent(index.source_epoch)}`;
  const pathWithQuery = `${args.pathWithQuery}${fixedRound}` +
    `&fact_index_id=${index.index_id}&to_state_seq=${index.to_state_seq}` +
    `&have_v=${bits.versions}&have_p=${bits.parents}&have_r=${bits.reviews}`;
  return { pathWithQuery, factClaims: { index, claims } };
}
