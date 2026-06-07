import { NATIVE_COMMANDS, type NativeCommandName } from '../../lib/platform/nativeCommands.js';

import type { CommandSecurityCapability } from './commandSecurityCapabilities.js';

interface CommandSecurityCapabilityGroup {
  capability: CommandSecurityCapability;
  commands: readonly NativeCommandName[];
}

const READ_COMMANDS = [
  NATIVE_COMMANDS.inspectReadwiseReaderSetup,
  NATIVE_COMMANDS.previewReadwiseReaderImport,
  NATIVE_COMMANDS.cancelReadwiseReaderImport,
  NATIVE_COMMANDS.previewReadwiseImportCleanup,
  NATIVE_COMMANDS.loadReadwiseBooksInventory,
  NATIVE_COMMANDS.openReadwiseBookDownload,
  NATIVE_COMMANDS.previewKeepImportRule,
  NATIVE_COMMANDS.selectImportDirectory,
  NATIVE_COMMANDS.selectImportTextFile,
  NATIVE_COMMANDS.loadExternalSearchFolders,
  NATIVE_COMMANDS.loadExternalSearchBrowseEntries,
  NATIVE_COMMANDS.loadExternalSearchPreview,
  NATIVE_COMMANDS.loadNodeSourceDetails,
  NATIVE_COMMANDS.loadNodeSourceUpdatePreview,
  NATIVE_COMMANDS.loadImportOverview,
  NATIVE_COMMANDS.loadRemovedSources,
  NATIVE_COMMANDS.loadPdfImportsInventory,
  NATIVE_COMMANDS.loadImportManagerSettings,
  NATIVE_COMMANDS.loadRemoteImageSourceContext,
  NATIVE_COMMANDS.resolveAttachmentResource,
  NATIVE_COMMANDS.resolveAppPaths,
  NATIVE_COMMANDS.loadLibraryPathSettings,
  NATIVE_COMMANDS.loadDatabaseMaintenanceStatus,
  NATIVE_COMMANDS.loadBackupSettings,
  NATIVE_COMMANDS.reviewGrade,
  NATIVE_COMMANDS.reviewPreview,
  NATIVE_COMMANDS.windowIsMaximized,
  NATIVE_COMMANDS.loadWorkspaceListSnapshot,
  NATIVE_COMMANDS.loadNodeDocument,
  NATIVE_COMMANDS.loadNodeBacklinks,
  NATIVE_COMMANDS.searchWorkspace,
  NATIVE_COMMANDS.loadWorkspaceSnapshot,
  NATIVE_COMMANDS.loadCompanionPairingOverview,
  NATIVE_COMMANDS.loadSyncIndex,
  NATIVE_COMMANDS.loadSyncNodes,
  NATIVE_COMMANDS.loadSyncObjects,
  NATIVE_COMMANDS.loadSyncNodeConflicts,
  NATIVE_COMMANDS.loadAppSettingsState,
  NATIVE_COMMANDS.loadSearchIndexRebuildStatus,
  NATIVE_COMMANDS.loadSyncPeers,
  NATIVE_COMMANDS.loadReviewSchedulerSettings,
  NATIVE_COMMANDS.loadReadingProgress,
  NATIVE_COMMANDS.listSqliteBackups,
  NATIVE_COMMANDS.loadSourceDispositionSummary
] as const satisfies readonly NativeCommandName[];

const DIAGNOSTIC_COMMANDS = [
  NATIVE_COMMANDS.appGetVersion,
  NATIVE_COMMANDS.appendReadingPositionTraceLog,
  NATIVE_COMMANDS.bootReport,
  NATIVE_COMMANDS.listSystemFonts,
  NATIVE_COMMANDS.loadPerformanceMemorySnapshot,
  NATIVE_COMMANDS.copyDiagnosticReport,
  NATIVE_COMMANDS.syncAppMenuState
] as const satisfies readonly NativeCommandName[];

const WINDOW_CONTROL_COMMANDS = [
  NATIVE_COMMANDS.windowClose,
  NATIVE_COMMANDS.windowMinimize,
  NATIVE_COMMANDS.windowRestartDevApp,
  NATIVE_COMMANDS.windowRestartApp,
  NATIVE_COMMANDS.windowToggleDevTools,
  NATIVE_COMMANDS.windowToggleMaximize
] as const satisfies readonly NativeCommandName[];

const DATA_MUTATION_COMMANDS = [
  NATIVE_COMMANDS.loadReadwiseBookEpub,
  NATIVE_COMMANDS.mergeReadwiseTopicHighlights,
  NATIVE_COMMANDS.restoreRemovedSource,
  NATIVE_COMMANDS.devReimportCurrentTopicSource,
  NATIVE_COMMANDS.importClipboardImageAttachment,
  NATIVE_COMMANDS.importLocalImageAttachment,
  NATIVE_COMMANDS.importRemoteImageAttachment,
  NATIVE_COMMANDS.forgetRemoteImageLearnedSource,
  NATIVE_COMMANDS.saveRemoteImageSourceOrigin,
  NATIVE_COMMANDS.rebuildExternalSearchIndex,
  NATIVE_COMMANDS.rebuildSearchIndex,
  NATIVE_COMMANDS.rebuildMirrorOutput,
  NATIVE_COMMANDS.rebuildMirrorAttachmentLinks,
  NATIVE_COMMANDS.exportCurrentArticleMirror,
  NATIVE_COMMANDS.clearLinkPanelBrowsingData,
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
  NATIVE_COMMANDS.restoreNodes,
  NATIVE_COMMANDS.applyReviewGrade,
  NATIVE_COMMANDS.saveReadingProgress
] as const satisfies readonly NativeCommandName[];

const IMPORT_MUTATION_COMMANDS = [
  NATIVE_COMMANDS.runReadwiseReaderImport,
  NATIVE_COMMANDS.runReadwiseImportCleanup,
  NATIVE_COMMANDS.resetReadwiseBookImport,
  NATIVE_COMMANDS.importExternalSearchDocument,
  NATIVE_COMMANDS.runClipboardImport,
  NATIVE_COMMANDS.runDirectoryImport,
  NATIVE_COMMANDS.runTextFileImport,
  NATIVE_COMMANDS.resetImportData
] as const satisfies readonly NativeCommandName[];

const SETTINGS_MUTATION_COMMANDS = [
  NATIVE_COMMANDS.saveExternalSearchFolders,
  NATIVE_COMMANDS.updateLibraryPathSetting,
  NATIVE_COMMANDS.saveBackupSettings,
  NATIVE_COMMANDS.enableCompanionSync,
  NATIVE_COMMANDS.disableCompanionSync,
  NATIVE_COMMANDS.clearCompanionPairedDevices,
  NATIVE_COMMANDS.removeCompanionPairedDevice,
  NATIVE_COMMANDS.setDesktopAsPrimaryDevice,
  NATIVE_COMMANDS.approveCompanionPairRequest,
  NATIVE_COMMANDS.rejectCompanionPairRequest,
  NATIVE_COMMANDS.saveAppSettingsState,
  NATIVE_COMMANDS.saveSyncPeers,
  NATIVE_COMMANDS.saveImportManagerSettings,
  NATIVE_COMMANDS.saveReviewSchedulerSettings
] as const satisfies readonly NativeCommandName[];

const RESTORE_MUTATION_COMMANDS = [
  NATIVE_COMMANDS.restoreSqliteDatabase,
  NATIVE_COMMANDS.importSourceDispositions,
  NATIVE_COMMANDS.restoreSourceDispositions
] as const satisfies readonly NativeCommandName[];

const DESTRUCTIVE_MUTATION_COMMANDS = [
  NATIVE_COMMANDS.softDeleteNodes,
  NATIVE_COMMANDS.deleteNodesPermanently,
  NATIVE_COMMANDS.resetSourceDispositions
] as const satisfies readonly NativeCommandName[];

const SYNC_MUTATION_COMMANDS = [
  NATIVE_COMMANDS.applySyncObjects,
  NATIVE_COMMANDS.applySyncNodes,
  NATIVE_COMMANDS.recordSyncNodeConflicts
] as const satisfies readonly NativeCommandName[];

const FILESYSTEM_OPEN_COMMANDS = [
  NATIVE_COMMANDS.openLocalPath,
  NATIVE_COMMANDS.openExternalDocumentFile
] as const satisfies readonly NativeCommandName[];

const FILESYSTEM_WRITE_COMMANDS = [
  NATIVE_COMMANDS.exportAttachmentImage,
  NATIVE_COMMANDS.backupSqliteDatabase,
  NATIVE_COMMANDS.exportSourceDispositions
] as const satisfies readonly NativeCommandName[];

export const COMMAND_SECURITY_CAPABILITY_GROUPS = [
  { capability: 'read', commands: READ_COMMANDS },
  { capability: 'diagnostic', commands: DIAGNOSTIC_COMMANDS },
  { capability: 'windowControl', commands: WINDOW_CONTROL_COMMANDS },
  { capability: 'dataMutation', commands: DATA_MUTATION_COMMANDS },
  { capability: 'importMutation', commands: IMPORT_MUTATION_COMMANDS },
  { capability: 'settingsMutation', commands: SETTINGS_MUTATION_COMMANDS },
  { capability: 'restoreMutation', commands: RESTORE_MUTATION_COMMANDS },
  { capability: 'destructiveMutation', commands: DESTRUCTIVE_MUTATION_COMMANDS },
  { capability: 'syncMutation', commands: SYNC_MUTATION_COMMANDS },
  { capability: 'filesystemOpen', commands: FILESYSTEM_OPEN_COMMANDS },
  { capability: 'filesystemWrite', commands: FILESYSTEM_WRITE_COMMANDS },
  { capability: 'externalOpen', commands: [NATIVE_COMMANDS.openExternalUrl] },
  { capability: 'clipboardWrite', commands: [NATIVE_COMMANDS.copyAttachmentImageToClipboard] }
] as const satisfies readonly CommandSecurityCapabilityGroup[];
