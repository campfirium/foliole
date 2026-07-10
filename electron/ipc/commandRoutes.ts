import { NATIVE_COMMANDS, type NativeCommandName } from '../../lib/platform/nativeCommands.js';

export type CommandRouteFamily = 'assistant' | 'import' | 'review' | 'storage' | 'windowAndUtility';

export interface CommandRouteEntry {
  command: NativeCommandName;
  family: CommandRouteFamily;
}

const IMPORT_COMMANDS = [
  NATIVE_COMMANDS.inspectReadwiseReaderSetup,
  NATIVE_COMMANDS.previewReadwiseReaderImport,
  NATIVE_COMMANDS.runReadwiseReaderImport,
  NATIVE_COMMANDS.cancelReadwiseReaderImport,
  NATIVE_COMMANDS.previewReadwiseImportCleanup,
  NATIVE_COMMANDS.runReadwiseImportCleanup,
  NATIVE_COMMANDS.openReadwiseBookDownload,
  NATIVE_COMMANDS.loadReadwiseBookEpub,
  NATIVE_COMMANDS.resetReadwiseBookImport,
  NATIVE_COMMANDS.previewKeepImportRule,
  NATIVE_COMMANDS.selectImportDirectory,
  NATIVE_COMMANDS.runTextFileImport,
  NATIVE_COMMANDS.runClipboardImport,
  NATIVE_COMMANDS.runDirectoryImport,
  NATIVE_COMMANDS.selectImportTextFile,
  NATIVE_COMMANDS.importExternalSearchDocument
] as const satisfies readonly NativeCommandName[];

const ASSISTANT_COMMANDS = [
  NATIVE_COMMANDS.assistantGetStatus,
  NATIVE_COMMANDS.assistantSendMessage,
  NATIVE_COMMANDS.assistantListThreadIndex,
  NATIVE_COMMANDS.assistantListThreadMessages,
  NATIVE_COMMANDS.assistantArchiveThreadIndex,
  NATIVE_COMMANDS.assistantRemoveThreadFromHistory
] as const satisfies readonly NativeCommandName[];

const STORAGE_COMMANDS = [
  NATIVE_COMMANDS.loadExternalSearchFolders,
  NATIVE_COMMANDS.saveExternalSearchFolders,
  NATIVE_COMMANDS.rebuildExternalSearchIndex,
  NATIVE_COMMANDS.loadExternalSearchBrowseEntries,
  NATIVE_COMMANDS.loadExternalSearchPreview,
  NATIVE_COMMANDS.openExternalDocumentFile,
  NATIVE_COMMANDS.listLocalFiles,
  NATIVE_COMMANDS.readLocalFile,
  NATIVE_COMMANDS.saveLocalFile,
  NATIVE_COMMANDS.loadNodeSourceDetails,
  NATIVE_COMMANDS.loadNodeSourceUpdatePreview,
  NATIVE_COMMANDS.acceptIncomingUpdate,
  NATIVE_COMMANDS.dismissIncomingUpdate,
  NATIVE_COMMANDS.importIncomingUpdateAsNew,
  NATIVE_COMMANDS.mergeReadwiseTopicHighlights,
  NATIVE_COMMANDS.loadImportOverview,
  NATIVE_COMMANDS.loadRemovedSources,
  NATIVE_COMMANDS.restoreRemovedSource,
  NATIVE_COMMANDS.devReimportCurrentTopicSource,
  NATIVE_COMMANDS.loadPdfImportsInventory,
  NATIVE_COMMANDS.loadReadwiseBooksInventory,
  NATIVE_COMMANDS.loadImportManagerSettings,
  NATIVE_COMMANDS.importClipboardImageAttachment,
  NATIVE_COMMANDS.importLocalImageAttachment,
  NATIVE_COMMANDS.importRemoteImageAttachment,
  NATIVE_COMMANDS.forgetRemoteImageLearnedSource,
  NATIVE_COMMANDS.loadRemoteImageSourceContext,
  NATIVE_COMMANDS.saveRemoteImageSourceOrigin,
  NATIVE_COMMANDS.resolveAttachmentResource,
  NATIVE_COMMANDS.copyAttachmentImageToClipboard,
  NATIVE_COMMANDS.exportAttachmentImage,
  NATIVE_COMMANDS.loadLibraryPathSettings,
  NATIVE_COMMANDS.loadDatabaseMaintenanceStatus,
  NATIVE_COMMANDS.loadBackupSettings,
  NATIVE_COMMANDS.rebuildMirrorOutput,
  NATIVE_COMMANDS.rebuildMirrorAttachmentLinks,
  NATIVE_COMMANDS.exportCurrentArticleMirror,
  NATIVE_COMMANDS.openImportRoot,
  NATIVE_COMMANDS.loadDiscoursePublishSettings,
  NATIVE_COMMANDS.loadDiscoursePublishCatalog,
  NATIVE_COMMANDS.saveDiscoursePublishSettings,
  NATIVE_COMMANDS.publishTopicToDiscourse,
  NATIVE_COMMANDS.updateLibraryPathSetting,
  NATIVE_COMMANDS.saveBackupSettings,
  NATIVE_COMMANDS.loadWorkspaceListSnapshot,
  NATIVE_COMMANDS.loadNodeDocument,
  NATIVE_COMMANDS.loadNodeBacklinks,
  NATIVE_COMMANDS.searchWorkspace,
  NATIVE_COMMANDS.loadWorkspaceSnapshot,
  NATIVE_COMMANDS.loadCompanionPairingOverview,
  NATIVE_COMMANDS.enableCompanionSync,
  NATIVE_COMMANDS.disableCompanionSync,
  NATIVE_COMMANDS.clearCompanionPairedDevices,
  NATIVE_COMMANDS.removeCompanionPairedDevice,
  NATIVE_COMMANDS.setDesktopAsPrimaryDevice,
  NATIVE_COMMANDS.approveCompanionPairRequest,
  NATIVE_COMMANDS.rejectCompanionPairRequest,
  NATIVE_COMMANDS.loadSyncIndex,
  NATIVE_COMMANDS.loadSyncNodes,
  NATIVE_COMMANDS.loadSyncObjects,
  NATIVE_COMMANDS.applySyncObjects,
  NATIVE_COMMANDS.loadSyncNodeConflicts,
  NATIVE_COMMANDS.applySyncNodes,
  NATIVE_COMMANDS.recordSyncNodeConflicts,
  NATIVE_COMMANDS.loadAppSettingsState,
  NATIVE_COMMANDS.saveAppSettingsState,
  NATIVE_COMMANDS.loadSearchIndexRebuildStatus,
  NATIVE_COMMANDS.rebuildSearchIndex,
  NATIVE_COMMANDS.loadSyncPeers,
  NATIVE_COMMANDS.saveSyncPeers,
  NATIVE_COMMANDS.saveImportManagerSettings,
  NATIVE_COMMANDS.loadReviewSchedulerSettings,
  NATIVE_COMMANDS.saveReviewSchedulerSettings,
  NATIVE_COMMANDS.loadReadingProgress,
  NATIVE_COMMANDS.saveReadingProgress,
  NATIVE_COMMANDS.resetImportData,
  NATIVE_COMMANDS.listSqliteBackups,
  NATIVE_COMMANDS.backupSqliteDatabase,
  NATIVE_COMMANDS.restoreSqliteDatabase,
  NATIVE_COMMANDS.loadSourceDispositionSummary,
  NATIVE_COMMANDS.exportSourceDispositions,
  NATIVE_COMMANDS.importSourceDispositions,
  NATIVE_COMMANDS.restoreSourceDispositions,
  NATIVE_COMMANDS.resetSourceDispositions,
  NATIVE_COMMANDS.createFolder,
  NATIVE_COMMANDS.createTopic,
  NATIVE_COMMANDS.createItem,
  NATIVE_COMMANDS.updateNodeContent,
  NATIVE_COMMANDS.updateNodeContentWithAnchors,
  NATIVE_COMMANDS.updateNodeReveal,
  NATIVE_COMMANDS.flushDirtyNodeSyncVersions,
  NATIVE_COMMANDS.relearnNode,
  NATIVE_COMMANDS.moveNodes,
  NATIVE_COMMANDS.replaceNodeOrder,
  NATIVE_COMMANDS.softDeleteNodes,
  NATIVE_COMMANDS.restoreNodes,
  NATIVE_COMMANDS.deleteNodesPermanently,
  NATIVE_COMMANDS.applyReviewGrade
] as const satisfies readonly NativeCommandName[];

const WINDOW_AND_UTILITY_COMMANDS = [
  NATIVE_COMMANDS.appGetVersion,
  NATIVE_COMMANDS.appendReadingPositionTraceLog,
  NATIVE_COMMANDS.listSystemFonts,
  NATIVE_COMMANDS.loadLoginItemSettings,
  NATIVE_COMMANDS.loadPerformanceMemorySnapshot,
  NATIVE_COMMANDS.openExternalUrl,
  NATIVE_COMMANDS.openLocalPath,
  NATIVE_COMMANDS.copyDiagnosticReport,
  NATIVE_COMMANDS.resolveAppPaths,
  NATIVE_COMMANDS.clearLinkPanelBrowsingData,
  NATIVE_COMMANDS.syncAppMenuState,
  NATIVE_COMMANDS.saveLoginItemSettings,
  NATIVE_COMMANDS.windowClose,
  NATIVE_COMMANDS.windowIsMaximized,
  NATIVE_COMMANDS.windowMinimize,
  NATIVE_COMMANDS.windowRestartDevApp,
  NATIVE_COMMANDS.windowRestartApp,
  NATIVE_COMMANDS.windowToggleDevTools,
  NATIVE_COMMANDS.windowToggleMaximize
] as const satisfies readonly NativeCommandName[];

const REVIEW_COMMANDS = [
  NATIVE_COMMANDS.bootReport,
  NATIVE_COMMANDS.reviewGrade,
  NATIVE_COMMANDS.reviewPreview
] as const satisfies readonly NativeCommandName[];

export const COMMAND_ROUTE_ENTRIES = [
  ...toRouteEntries(ASSISTANT_COMMANDS, 'assistant'),
  ...toRouteEntries(IMPORT_COMMANDS, 'import'),
  ...toRouteEntries(STORAGE_COMMANDS, 'storage'),
  ...toRouteEntries(WINDOW_AND_UTILITY_COMMANDS, 'windowAndUtility'),
  ...toRouteEntries(REVIEW_COMMANDS, 'review')
] as const satisfies readonly CommandRouteEntry[];

function toRouteEntries(commands: readonly NativeCommandName[], family: CommandRouteFamily): CommandRouteEntry[] {
  return commands.map((command) => ({ command, family }));
}

export function buildCommandRouteMap(
  entries: readonly CommandRouteEntry[],
  expectedCommands: readonly NativeCommandName[] = Object.values(NATIVE_COMMANDS)
): ReadonlyMap<NativeCommandName, CommandRouteFamily> {
  const routes = new Map<NativeCommandName, CommandRouteFamily>();
  for (const entry of entries) {
    if (routes.has(entry.command)) {
      throw new Error(`duplicate native command route: ${entry.command}`);
    }
    routes.set(entry.command, entry.family);
  }
  for (const command of expectedCommands) {
    if (!routes.has(command)) {
      throw new Error(`missing native command route: ${command}`);
    }
  }
  return routes;
}

const COMMAND_ROUTE_MAP = buildCommandRouteMap(COMMAND_ROUTE_ENTRIES);
const LEGACY_ASSISTANT_COMMAND_ROUTES = new Set(['assistant_delete_thread_index']);

export function resolveCommandRoute(command: string): CommandRouteFamily | null {
  if (LEGACY_ASSISTANT_COMMAND_ROUTES.has(command)) return 'assistant';
  return COMMAND_ROUTE_MAP.get(command as NativeCommandName) ?? null;
}
