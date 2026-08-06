import type { CompanionAttachmentResourceSyncPlugin } from './companionAttachmentResourceSyncPluginTypes';
import type { CompanionContentBlobSyncPlugin } from './companionContentBlobSyncPluginTypes';
import type { CompanionPairingSyncPlugin } from './companionPairingSyncPluginTypes';

interface CompanionDiscoveryCandidatesPayload {
  candidates: Array<{
    endpoint_url: string;
    protocol_txt?: Record<string, string>;
    source: 'direct' | 'nsd';
  }>;
}

export interface CompanionWorkspaceSyncPlugin
  extends CompanionAttachmentResourceSyncPlugin, CompanionContentBlobSyncPlugin, CompanionPairingSyncPlugin {
  desktopHttpRequest(args: {
    body?: string;
    headers?: Record<string, string>;
    method: string;
    url: string;
  }): Promise<{ body: string; status: number }>;
  loadDiscoveryCandidates(): Promise<CompanionDiscoveryCandidatesPayload>;
  resolveAttachmentResource(args: {
    attachment_id: string;
    mime_type?: string | null;
    storage_key?: string | null;
  }): Promise<{
    mime_type?: string | null;
    resource_url: string | null;
    status: 'missing_file' | 'not_found' | 'ready';
  }>;
}
