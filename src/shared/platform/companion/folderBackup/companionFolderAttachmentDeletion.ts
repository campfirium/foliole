import { attachmentDatabaseRevision } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';
import { readFolderAttachmentProfile, readFolderAttachmentWork, type FolderAttachmentWork } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';
import { readCompanionAttachmentReferences } from '../runtime/companionAttachmentReferenceSnapshot';

export interface FolderDeletionSnapshot {
  profile: string;
  revision: string;
  candidates: FolderAttachmentWork[];
}

/** Capture committed, unreferenced candidates before the native database snapshot starts. */
export async function captureFolderAttachmentDeletions(owner: CapacitorCompanionDatabaseOwner): Promise<FolderDeletionSnapshot | null> {
  const initial = await owner.read(async db => {
    const profile = await readFolderAttachmentProfile(db);
    if (!profile) return null;
    return { profile, candidates: (await readFolderAttachmentWork(db, profile)).filter(entry => entry.action === 'delete') };
  });
  if (!initial?.candidates.length) return null;
  const references = await readCompanionAttachmentReferences(owner);
  const referenced = new Set(references.storageKeys);
  return owner.read(async db => {
    if (await attachmentDatabaseRevision(db) !== references.revision) throw new Error('attachment_scan_database_changed');
    const candidates: FolderAttachmentWork[] = [];
    for (const entry of initial.candidates) {
      if (!referenced.has(entry.storage_key) && !await retainedReference(db, entry.storage_key)) candidates.push(entry);
    }
    return { profile: initial.profile, revision: references.revision, candidates };
  });
}

// Preserve explicit mounts and retained versions even when they are outside current reading demand.
async function retainedReference(db: DbPort, key: string) {
  const [row] = await db.query(`SELECT 1 AS present WHERE
    EXISTS (SELECT 1 FROM nodes WHERE instr(resource_references,?)>0) OR
    EXISTS (SELECT 1 FROM node_sync_versions WHERE instr(snapshot_json,?)>0 OR instr(body_text,?)>0
      OR (body_text IS NULL AND COALESCE(json_type(snapshot_json,'$.content'),'null') <> 'text'
        AND COALESCE(json_extract(snapshot_json,'$.body_deleted'),0) <> 1
        AND json_extract(snapshot_json,'$.body_blob_hash') IS NOT NULL)) OR
    EXISTS (SELECT 1 FROM node_sync_conflicts WHERE instr(snapshot_json,?)>0) OR
    EXISTS (SELECT 1 FROM node_sync_tombstones WHERE instr(snapshot_json,?)>0)`, [key, key, key, key, key]);
  return Boolean(row);
}

/** A mutation during snapshot creation invalidates deletion permission, never the database backup. */
export async function validateFolderAttachmentDeletions(owner: CapacitorCompanionDatabaseOwner,
  snapshot: FolderDeletionSnapshot | null, profile: string) {
  if (!snapshot || snapshot.profile !== profile) return [];
  return owner.read(async db => await attachmentDatabaseRevision(db) === snapshot.revision ? snapshot.candidates : []);
}
