export interface CompanionAttachmentResourceSyncPlugin {
  downloadAttachmentResourceBatch(args: {
    resources: Array<{
      attachment_id: string;
      content_hash: string;
      mime_type: string;
      storage_key: string;
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
      mime_type: string;
      size_bytes: number;
      storage_key: string;
    }>;
  }>;
}
