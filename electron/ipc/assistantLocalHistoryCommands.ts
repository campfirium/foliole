import type { NativeAssistantThreadMessageRecord } from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  deleteAssistantImageFiles,
  readAssistantImageContent
} from '../assistant/assistantImageStorage.js';
import { runWithAssistantHistoryConnectionOwner } from '../database/assistantHistoryConnection.js';
import {
  archiveAssistantThreadIndex,
  deleteAssistantThreadIndexWithImages,
  listAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import { linkAssistantThreadMaterials, unlinkAssistantThreadMaterial } from '../database/assistantThreadMaterials.js';
import { listAssistantThreadMessages } from '../database/assistantThreadMessages.js';

import {
  readAssistantAttachmentId,
  readAssistantMaterialIds,
  readAssistantProvider,
  readOpeningLocation,
  readProviderThreadId
} from './assistantCommandInputs.js';

export function handleAssistantLocalHistoryCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.assistantLinkThreadMaterial) {
    const nodeIds = readAssistantMaterialIds([args.nodeId]);
    return runWithAssistantHistoryConnectionOwner(() => linkAssistantThreadMaterials(
      readAssistantProvider(args.provider), readProviderThreadId(args), nodeIds
    ));
  }
  if (command === NATIVE_COMMANDS.assistantUnlinkThreadMaterial) {
    const [nodeId] = readAssistantMaterialIds([args.nodeId]);
    if (!nodeId) throw new Error('invalid_assistant_material_id');
    return runWithAssistantHistoryConnectionOwner(() => unlinkAssistantThreadMaterial(
      readAssistantProvider(args.provider), readProviderThreadId(args), nodeId
    ));
  }
  if (command === NATIVE_COMMANDS.assistantListThreadIndex) {
    const location = readOpeningLocation(args.location);
    return runWithAssistantHistoryConnectionOwner(() => listAssistantThreadIndex({
      ...(args.includeArchived === true ? { includeArchived: true } : {}),
      ...(args.includeDeleted === true ? { includeDeleted: true } : {}),
      ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
      ...(location ? { location } : {})
    }));
  }
  if (command === NATIVE_COMMANDS.assistantListThreadMessages) {
    return runWithAssistantHistoryConnectionOwner(() => listAssistantThreadMessages(
      readAssistantProvider(args.provider),
      readProviderThreadId(args)
    ).map(withoutAttachedContext));
  }
  if (command === NATIVE_COMMANDS.assistantReadImageAttachment) {
    return runWithAssistantHistoryConnectionOwner(() =>
      readAssistantImageContent(readAssistantAttachmentId(args.attachmentId))
    );
  }
  if (command === NATIVE_COMMANDS.assistantArchiveThreadIndex) {
    return runWithAssistantHistoryConnectionOwner(() => archiveAssistantThreadIndex(
      readAssistantProvider(args.provider),
      readProviderThreadId(args)
    ));
  }
  if (command === NATIVE_COMMANDS.assistantRemoveThreadFromHistory) {
    return runWithAssistantHistoryConnectionOwner(async () => {
      const removed = deleteAssistantThreadIndexWithImages(
        readAssistantProvider(args.provider),
        readProviderThreadId(args)
      );
      await deleteAssistantImageFiles(removed.unreferencedImages);
      return removed.record;
    });
  }
  return undefined;
}

// Attached context is model input only; the renderer shows what the user typed.
function withoutAttachedContext(message: NativeAssistantThreadMessageRecord) {
  const visible = { ...message };
  delete visible.attachedContext;
  return visible;
}
