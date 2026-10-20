import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS as queries } from '../../lib/core/database/androidCompanionDocumentResourceQueryDefinitions';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { readFramedSyncObjectStateInventory } from '../../lib/core/sync/framedSyncObjectStateInventory';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';
import type { CapacitorCompanionDatabaseOwner } from '../shared/platform/companion/runtime/capacitorCompanionDatabaseOwner';
import { completeEligibleRemovals } from '../shared/platform/companion/sync/syncGroupMemberStateReads';
import { applyCompanionSyncGroupMemberState } from '../shared/platform/companion/sync/syncGroupMemberStateStore';

import { requireValue } from './capacityAcceptanceSafety';
import { externalAcceptanceBody, externalAcceptanceGroup, seedExternalMembershipAcceptance } from './externalMembershipAcceptanceFixture';

export async function runExternalMembershipAcceptance(owner: CapacitorCompanionDatabaseOwner) {
  const now = new Date().toISOString();
  const devices = await owner.runWriter(db => db.transaction(tx => seedExternalMembershipAcceptance(tx, now)));
  const provider = devices[1]!;
  const sender = devices[2]!.device_identity_key;
  const state: SyncGroupMemberStatePayload = { contract_version: 3, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    group_id: externalAcceptanceGroup, library_epoch: 'acceptance-epoch', proof_revision: 0,
    source_proof_revisions: {}, devices, removals: [], restore: null, sender_device_identity_key: sender };
  await owner.readSnapshot(db => assertExternalState(db, true, true));
  provider.state = 'left';
  provider.left_at = now;
  await applyState(state, sender);
  await owner.readSnapshot(db => assertExternalState(db, false, true));
  state.removals = [{ decision_id: 'completed-departure', created_at: now, completed_at: now,
    superseded_at: now, confirmations: [], initiated_by_device_identity_key: sender,
    target_device_identity_key: provider.device_identity_key }];
  provider.state = 'active';
  provider.left_at = null;
  await applyState(state, sender);
  await owner.readSnapshot(db => assertExternalState(db, true, true));
  provider.state = 'left';
  provider.left_at = now;
  await applyState(state, sender);
  const expiresAt = Date.parse(now) + 7 * 24 * 60 * 60 * 1000;
  await maintain(owner, expiresAt - 1);
  await owner.readSnapshot(db => assertExternalState(db, false, true));
  await maintain(owner, expiresAt);
  await owner.readSnapshot(db => assertExternalState(db, false, false));
  return { hiddenRetained: true, rejoinRestored: true, retainedBeforeExpiry: true,
    purgedAtExpiry: true, activeProviderPreserved: true, noDeletionRecords: true };
}

async function applyState(state: SyncGroupMemberStatePayload, sender: string) {
  const result = await applyCompanionSyncGroupMemberState(state, sender);
  requireValue(result.normal_sync_ready && !result.local_exited, 'Member state was not applied');
}

function maintain(owner: CapacitorCompanionDatabaseOwner, time: number) {
  return owner.runWriter(db => db.transaction(tx =>
    completeEligibleRemovals(tx, externalAcceptanceGroup, new Date(time).toISOString())));
}

async function assertExternalState(db: DbPort, visible: boolean, retained: boolean) {
  const folders = await db.query(queries.externalSearchFolders.sql);
  const entries = await db.query(queries.externalDocumentDirectoryEntries.sql);
  const documents = await db.query(queries.externalDocumentById.sql, ['departing:note.md']);
  const search = await db.query(queries.externalDocumentSearch.sql,
    ['original', 'original', 'original', 'original', 'original', 'original', 'original', 100]);
  for (const [rows, key, value] of [[folders, 'id', 'departing'], [entries, 'folder_id', 'departing'],
    [documents, 'folder_id', 'departing'], [search, 'folder_id', 'departing']] as const) {
    requireValue(rows.some(row => row[key] === value) === visible, 'External visibility differs');
  }
  requireValue(folders.some(row => row.id === 'remaining') && entries.some(row => row.folder_id === 'remaining'),
    'Active provider disappeared');
  const body = await db.query('SELECT content FROM external_documents WHERE document_id = ?', ['departing:note.md']);
  requireValue(retained ? body[0]?.content === externalAcceptanceBody : body.length === 0, 'External body retention differs');
  const folder = await db.query('SELECT id FROM external_search_folders WHERE id = ?', ['departing']);
  const source = await db.query('SELECT source_ref FROM desktop_sources WHERE source_ref = ?', ['external:departing']);
  requireValue(folder.length === Number(retained) && source.length === Number(retained), 'External projection retention differs');
  const states = await db.query("SELECT deleted_at FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'departing'");
  requireValue(states.length === Number(retained) && states.every(row => row.deleted_at === null), 'External deletion record changed');
  const inventory = await readFramedSyncObjectStateInventory(db);
  requireValue(inventory.some(entry => entry.globalId === 'departing') === visible, 'External inventory visibility differs');
}
