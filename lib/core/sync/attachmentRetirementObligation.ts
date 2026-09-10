import type { AttachmentSyncTombstone } from '../../platform/attachmentSyncTombstone.js';

import type { DbPort } from './dbPort.js';

export type AttachmentRetirementObligationStage = 'database_committed' | 'verified' | 'finalized';

export interface AttachmentRetirementObligation {
  items: AttachmentSyncTombstone[];
  journalToken: string;
  libraryScope: string;
}

export async function recordAttachmentRetirementObligation(
  port: DbPort,
  obligation: AttachmentRetirementObligation,
  stage: AttachmentRetirementObligationStage,
  updatedAt = new Date().toISOString()
) {
  await port.run(
    `INSERT INTO attachment_retirement_obligations (
       journal_token, library_scope, stage, items_json, updated_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(journal_token) DO UPDATE SET
       library_scope = excluded.library_scope, stage = excluded.stage,
       items_json = excluded.items_json, updated_at = excluded.updated_at`,
    [obligation.journalToken, obligation.libraryScope, stage, JSON.stringify(obligation.items), updatedAt]
  );
}
