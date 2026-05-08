export interface CompanionAttachmentResourceSyncPlugin {
  commitAttachmentResourceBatch(args: { batch_token: string }): Promise<{
    synced_attachment_ids: string[];
  }>;
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
}
