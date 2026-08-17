import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resetImportData } from '../database/importMaintenance.js';
import {
  dismissNodeTextAlternative,
  loadNodeTextAlternativePreview,
  promoteNodeTextAlternative
} from '../database/nodeTextAlternatives.js';
import { searchWorkspace } from '../database/workspaceSearch.js';
import { reimportCurrentTopicSource } from '../import/currentSourceReimport.js';
import {
  acceptPendingIncomingUpdate,
  dismissPendingIncomingUpdate,
  importPendingIncomingUpdateAsNewTopic
} from '../import/incomingUpdateActions.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';
import { loadNodeSourceUpdatePreview } from '../import/nodeSourceUpdatePreview.js';
import { mergeReadwiseTopicHighlights } from '../import/readwiseTopicMerge.js';
import { restoreRemovedSource } from '../import/removedSourceRestore.js';

import { asString } from './commandParsers.js';
import { toNativeImportOverview } from './importOverviewPayload.js';
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';
import { toNativePdfImportsInventory } from './pdfImportsInventoryPayload.js';
import { toNativeReadwiseBooksInventory } from './readwiseBooksInventoryPayload.js';
import { loadRemovedSources } from './removedSourcesPayload.js';
import { handleStorageAttachmentCommand } from './storageAttachmentCommands.js';
import { handleSqliteMaintenanceCommand } from './storageCommandSupport.js';
import { handleLocalFileStorageCommand } from './storageLocalFileCommands.js';
import { handleNodeMutationCommand } from './storageNodeMutationCommands.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';
import { handleSettingsStorageCommand } from './storageSettingsCommands.js';
import { handleSyncMutationCommand } from './storageSyncCommands.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2] = null
): Promise<unknown> {
  const syncMutationResult = handleSyncMutationCommand(command, args);
  if (syncMutationResult !== undefined) {
    return syncMutationResult;
  }
  const nodeMutationResult = await handleNodeMutationCommand(command, args, window);
  if (nodeMutationResult !== undefined) {
    return nodeMutationResult;
  }
  const sqliteMaintenanceResult = handleSqliteMaintenanceCommand(command, args);
  if (sqliteMaintenanceResult !== undefined) {
    return sqliteMaintenanceResult;
  }
  const workspaceReadResult = handleWorkspaceReadCommand(command, args);
  if (workspaceReadResult !== undefined) {
    return workspaceReadResult;
  }
  const attachmentResult = handleStorageAttachmentCommand(command, args, window);
  if (attachmentResult !== undefined) {
    return attachmentResult;
  }
  const storageReadResult = await handleStorageReadCommand(command, args);
  if (storageReadResult !== undefined) {
    return storageReadResult;
  }
  const localFileResult = await handleLocalFileStorageCommand(command, args);
  if (localFileResult !== undefined) {
    return localFileResult;
  }
  const importMutationResult = await handleImportMutationCommand(command, args, window);
  if (importMutationResult !== undefined) {
    return importMutationResult;
  }
  const settingsResult = await handleSettingsStorageCommand(command, args, window);
  if (settingsResult !== undefined) {
    return settingsResult;
  }
  const readingAndReviewResult = handleReadingAndReviewCommand(command, args);
  if (readingAndReviewResult !== undefined) {
    return readingAndReviewResult;
  }
  return undefined;
}

async function handleStorageReadCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.searchWorkspace) {
    return searchWorkspace(asString(args.query, 'query'));
  }
  if (command === NATIVE_COMMANDS.loadImportOverview) {
    return toNativeImportOverview();
  }
  if (command === NATIVE_COMMANDS.loadRemovedSources) {
    return loadRemovedSources();
  }
  if (command === NATIVE_COMMANDS.loadPdfImportsInventory) {
    return toNativePdfImportsInventory();
  }
  if (command === NATIVE_COMMANDS.loadReadwiseBooksInventory) {
    return toNativeReadwiseBooksInventory();
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceDetails) {
    return toNativeNodeSourceDetails(asString(args.node_id, 'node_id'));
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceUpdatePreview) {
    return loadNodeSourceUpdatePreview(asString(args.node_id, 'node_id'));
  }
  if (command === NATIVE_COMMANDS.loadNodeTextAlternativePreview) {
    return loadNodeTextAlternativePreview(asString(args.node_id, 'node_id'));
  }
  return undefined;
}

async function handleImportMutationCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2]
) {
  if (command === NATIVE_COMMANDS.mergeReadwiseTopicHighlights) {
    const result = await mergeReadwiseTopicHighlights(asString(args.node_id, 'node_id'), window);
    if (result.status === 'merged') {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (command === NATIVE_COMMANDS.acceptIncomingUpdate) {
    return handleAcceptIncomingUpdate(args, window);
  }
  const alternativeResult = await handleTextAlternativeMutation(command, args, window);
  if (alternativeResult !== undefined) return alternativeResult;
  if (command === NATIVE_COMMANDS.dismissIncomingUpdate) {
    const result = dismissPendingIncomingUpdate(asString(args.incoming_update_id, 'incoming_update_id'));
    notifyManagedInboxUpdated(result.incoming_update_id);
    return result;
  }
  if (command === NATIVE_COMMANDS.importIncomingUpdateAsNew) {
    const result = importPendingIncomingUpdateAsNewTopic(asString(args.incoming_update_id, 'incoming_update_id'));
    if (result.status === 'imported_as_new' && result.node_id) {
      notifyWorkspaceContentChanged(window);
    }
    notifyManagedInboxUpdated(result.incoming_update_id);
    return result;
  }
  if (command === NATIVE_COMMANDS.resetImportData) {
    const result = resetImportData();
    if (result.deletedNodeCount > 0) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (command === NATIVE_COMMANDS.restoreRemovedSource) {
    const result = await restoreRemovedSource(asString(args.rule_id, 'rule_id'), asString(args.source_path, 'source_path'));
    if (result.status === 'restored' && result.node_id) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (command === NATIVE_COMMANDS.devReimportCurrentTopicSource) {
    const result = await reimportCurrentTopicSource(asString(args.node_id, 'node_id'));
    if (result.status === 'reimported' && result.node_id) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  return undefined;
}

function handleAcceptIncomingUpdate(
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2]
) {
  const result = acceptPendingIncomingUpdate({
    content: asString(args.content, 'content'),
    id: asString(args.incoming_update_id, 'incoming_update_id')
  });
  if (result.status === 'accepted' && result.node_id) notifyWorkspaceContentChanged(window);
  notifyManagedInboxUpdated(result.incoming_update_id);
  return result;
}

async function handleTextAlternativeMutation(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2]
) {
  if (command === NATIVE_COMMANDS.promoteNodeTextAlternative) {
    const result = await promoteNodeTextAlternative(asString(args.alternative_id, 'alternative_id'));
    if (result.status === 'promoted') notifyWorkspaceContentChanged(window);
    return result;
  }
  if (command === NATIVE_COMMANDS.dismissNodeTextAlternative) {
    return dismissNodeTextAlternative(asString(args.alternative_id, 'alternative_id'));
  }
  return undefined;
}
