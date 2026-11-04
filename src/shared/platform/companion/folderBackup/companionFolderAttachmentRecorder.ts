import { completeFolderAttachmentCopy, prepareFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { RequestSyncDatabaseHost } from '../../../../../lib/core/sync/requestSyncObjectEndpoint';

export interface CompanionFolderAttachmentRecorder {
  prepare(key: string): Promise<void>;
  complete(db: DbPort, key: string): Promise<void>;
}

export function companionFolderAttachmentRecorder(host: Pick<RequestSyncDatabaseHost, 'write'>): CompanionFolderAttachmentRecorder {
  return {
    prepare: async key => { await host.write(db => prepareFolderAttachmentCopy(db, key)); },
    complete: completeFolderAttachmentCopy
  };
}
