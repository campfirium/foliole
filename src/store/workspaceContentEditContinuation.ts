import type { LocalContentEdit } from '../../lib/core/sync/localContentEdit';

export interface PendingContentEdit {
  edit?: LocalContentEdit | undefined;
  inputBaseVersionId?: string | undefined;
  submittedVersionId?: string | undefined;
}

export interface ContentEditContinuation {
  inputBaseVersionId: string;
  submittedVersionId: string;
}

/** A receipt is handed only to input that was already waiting on this save. */
export function readContentEditContinuation(args: PendingContentEdit): ContentEditContinuation | undefined {
  return args.edit && args.submittedVersionId ? {
    inputBaseVersionId: args.inputBaseVersionId ?? args.edit.baseVersionId,
    submittedVersionId: args.submittedVersionId
  } : undefined;
}

export function continuePendingContentEdit(args: PendingContentEdit, previous: ContentEditContinuation) {
  if (args.edit?.baseVersionId !== previous.inputBaseVersionId) return;
  args.edit.baseVersionId = previous.submittedVersionId;
  delete args.edit.baseContent;
}
