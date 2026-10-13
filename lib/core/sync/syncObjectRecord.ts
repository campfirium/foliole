export interface SyncObjectRecord {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  payload_json: string | null;
  updated_at: string;
}
