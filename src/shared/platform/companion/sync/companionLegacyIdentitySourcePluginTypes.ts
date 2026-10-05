import type { SyncIdentityPackPage } from '../../../../../lib/core/sync/syncIdentityPackPage';

/** Native methods retained only by unreachable pre-v22 test fixtures. */
export interface CompanionLegacyIdentitySourcePlugin {
  buildIdentitySourcePack(args: {
    page: SyncIdentityPackPage;
    snapshot_path: string;
  }): Promise<{ archive_base64url: string }>;
  closeIdentitySourceView(args: { snapshot_path: string }): Promise<{ deleted: boolean }>;
  createIdentitySourceView(): Promise<{ snapshot_path: string; source_view_id: string }>;
}
