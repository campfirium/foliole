import type { WorkspaceSnapshot } from '../core/database/workspaceSnapshot.js';

export interface NativeCompanionWorkspaceSyncState {
  endpoint_url: string | null;
  last_synced_at: string | null;
  workspace_snapshot: WorkspaceSnapshot | null;
}

export interface NativeCompanionReadableArticlePayload {
  readable_article: {
    content: string;
    node_id: string;
    title: string;
  } | null;
}

export interface CompanionWorkspaceVersionPayload {
  app_version: string;
  exported_at: string;
  has_snapshot: boolean;
  peer_id: string;
}

export interface CompanionWorkspaceSnapshotPayload {
  app_version: string;
  exported_at: string;
  peer_id: string;
  workspace_snapshot: WorkspaceSnapshot | null;
}
