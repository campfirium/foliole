export interface CompanionAttachmentResourceSyncPlugin {
  prepareAttachmentRetirement(args: {
    library_scope: string;
    tombstones: Array<{
      attachment_id: string;
      content_hash: string;
      mime_type: string;
      storage_key: string;
    }>;
  }): Promise<{ journal_token: string }>;
  finishAttachmentRetirement(args: {
    committed: boolean;
    journal_token: string;
  }): Promise<Record<string, never>>;
  finalizeAttachmentRetirement(args: { journal_token: string }): Promise<Record<string, never>>;
  downloadAttachmentResourceBatch(args: {
    resources: Array<{
      attachment_id: string;
      content_hash: string;
      headers: Record<string, string>;
      url: string;
    }>;
  }): Promise<{
    batch_token: string;
    failed_attachment_ids?: string[];
    synced_attachment_ids: string[];
  }>;
  finishAttachmentResourceBatch(args: { batch_token: string; committed: boolean }): Promise<Record<string, never>>;
  stageAttachmentResourceBatch(args: { batch_token: string }): Promise<{
    failed_attachment_ids: string[];
    manifest: Array<{
      attachment_id: string;
      content_hash: string;
      size_bytes: number;
      storage_key: string;
    }>;
  }>;
}
