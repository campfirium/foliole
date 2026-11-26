import type { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

// Which desktop commands the action cost check measures, and why each other command is not measured.
// Every command appears exactly once. `everydayNotYetMeasured` is the backlog and only shrinks.

type CommandName = keyof typeof NATIVE_COMMANDS;
const names = (list: string) => list.trim().split(/\s+/u) as CommandName[];

/** Run by actionCostScenarios.testSupport.ts; the scale test checks this list against what it measured. */
export const MEASURED_COMMANDS = names(`
  openDailyFlow commitDailyFlow createTopic updateNodeContent updateNodeContentWithAnchors moveNodes softDeleteNodes
  restoreNodes applyReviewGrade
`);

export const UNMEASURED_COMMANDS: Record<string, CommandName[]> = {
  /** Reads or writes library content during ordinary use. Not yet measured: add a scenario and move the name. */
  everydayNotYetMeasured: names(`
    readDailyFlowView saveDailyFlowSourceSettings loadWorkspaceListProjection loadNodeDocument loadNodeBacklinks
    searchPdfDocument searchWorkspace loadWorkspaceSearchBatch releaseWorkspaceSearch loadNodeLearning
    loadReadingProgress loadReadingResume loadForegroundTimeHistory loadReviewCalendarHistory
    loadSourceDispositionSummary loadEditorOperationHistory loadNodeSourceDetails loadNodeSourceUpdatePreview
    loadNodeTextAlternativePreview loadImportOverview loadRemovedSources loadPdfImportsInventory listDives
    loadFolderListSortMemory loadAppSettingsState loadSplitTopicPreview loadRemoteImageSourceContext
    loadRemoteImageMetadata resolveAttachmentResource reviewPreview reviewGrade bootReport
    createFolder createItem createPdfImageExcerpt updateNodeReveal flushDirtyNodeSyncVersions relearnNode replaceNodeOrder
    saveReadingProgress saveNodeOpenState saveEditorOperationHistory saveNodeReadingState saveNodeReviewState
    createDive renameDive convertDiveDirectory addDiveSources removeDiveSource retainNodeEditorBase
    setNodeContentEditingSession releaseNodeEditorBase splitTopic deleteNodesPermanently resetSourceDispositions
    dismissNodeTextAlternative promoteNodeTextAlternative acceptIncomingUpdate dismissIncomingUpdate
    importIncomingUpdateAsNew mergeReadwiseTopicHighlights restoreRemovedSource saveWatchedFolderConflict
    importClipboardImageAttachment importLocalImageAttachment importRemoteImageAttachment forgetRemoteImageLearnedSource
    saveRemoteImageSourceOrigin saveFolderListSortMemory
  `),
  /** Applies or reads sync data; needs a second library as the peer. */
  needsSyncPeer: names(`
    syncCompanionNow applySyncObjects applySyncNodes recordSyncNodeConflicts loadSyncIndex loadSyncNodes loadSyncObjects
    loadSyncNodeConflicts loadSyncPeers saveSyncPeers loadSyncGroupOverview discoverSyncGroups recoverSyncGroupDiscovery
    stopDiscoverSyncGroups createSyncGroup leaveSyncGroup overwriteExpiredSyncGroupMember removeSyncGroupDevice
    requestSyncGroupJoin completeSyncGroupJoin enableCompanionSync disableCompanionSync pauseCompanionSync
    resumeCompanionSync acceptSyncGroupJoinRequest rejectSyncGroupJoinRequest loadActiveSyncGroupDevice
    loadDesktopSyncDiagnostics resolveReadwiseJoinDecision selectReadwiseImportDevice enableWebDavRelay
    confirmWebDavCredentialDelivery saveWebDavSetupDraft saveWebDavRelayDirectory saveWebDavAttachmentPolicy
    loadWebDavRelayDirectory loadWebDavSetupDraft openWebDavRelayLog
  `),
  /** Work is expected to follow the whole library: backup, restore, merge, rebuild, bulk export or reset. */
  wholeLibraryByDesign: names(`
    loadWorkspaceSnapshot loadWorkspaceListSnapshot backupSqliteDatabase restoreSqliteDatabase compactSqliteDatabase
    mergeLibrary inspectBackupRestoreSync loadDatabaseSpaceStatus loadBackupSettings saveBackupSettings
    loadBackupRetentionStatus listSqliteBackups pickLibraryMergeSource pickLibraryMergeAttachments startBackupSearch
    nextBackupSearch cancelBackupSearch rebuildSearchIndex loadSearchIndexRebuildStatus rebuildExternalSearchIndex
    rebuildMirrorOutput rebuildMirrorAttachmentLinks maintainAttachments loadDatabaseMaintenanceStatus resetImportData
    importSourceDispositions exportSourceDispositions restoreSourceDispositions loadReviewTrainingPlan
    loadReviewTrainingInput saveReviewTrainingModel updateLibraryPathSetting loadLibraryPathSettings
  `),
  /** Work follows an external source, folder or imported file; needs a source fixture. */
  needsImportSource: names(`
    previewSourceManagement confirmSourceManagement previewExternalSearchFolderReconnect removeExternalSearchFolder
    disconnectExternalSearchFolder reconnectExternalSearchFolder loadExternalSearchFolders saveExternalSearchFolders
    loadExternalSearchBrowseEntries loadExternalSearchPreview openExternalDocumentFile importExternalSearchDocument
    loadWatchedFolderBindings previewWatchedFolderReconnect confirmWatchedFolderReconnect disconnectWatchedFolder
    removeWatchedFolder loadImportManagerSettings saveImportManagerSettings activateReadwiseOnThisHost
    connectReadwiseApiFromClipboard disconnectReadwiseApi loadReadwiseHostAssignment loadReadwiseApiConnection
    loadReadwiseApiScheduleStatus previewReadwiseIdentityBindings confirmReadwiseIdentityBindings
    previewReadwiseSourceCutover runReadwiseSourceCutover loadReadwiseBooksInventory inspectReadwiseReaderSetup
    previewReadwiseReaderImport runReadwiseReaderImport cancelReadwiseReaderImport runReadwiseApiReconcile
    cancelReadwiseApiReconcile previewReadwiseImportCleanup runReadwiseImportCleanup openReadwiseBookDownload
    loadReadwiseBookEpub loadReadwiseOriginalEpubActionState useReadwiseOriginalEpub exportReadwiseOriginalEpub
    loadReadwiseSourceResyncActionState resyncReadwiseSource loadReadwisePdfOriginalActionState getReadwisePdfOriginal
    resetReadwiseBookImport previewKeepImportRule pickSuperMemoSource readSuperMemoSource getSuperMemoSourceSelection
    selectSuperMemoCollection listSuperMemoImports previewSuperMemoAdjustment previewSuperMemoImport
    activateSavedSuperMemoSource clearSuperMemoSourceSelection adjustSuperMemoImport runSuperMemoImport
    selectImportDirectory selectImportTextFile openGlobalCapturePanel runClipboardImport runDirectoryImport
    runTextFileImport devReimportCurrentTopicSource consumeGuidedSampleStartup
  `),
  /** Publishing or exporting chosen material to a file or outside service. */
  publishAndExport: names(`
    exportCurrentArticleMirror exportAttachmentImage exportNodePdf copyAttachmentImageToClipboard sendArticleToEdge
    publishFoliolePublishThemeChanges unpublishFolioleTopics publishTopicToFoliole publishTopicToDiscourse
    publishTopicToWordPress loadFoliolePublishSettings loadFoliolePublishSiteTitle loadFoliolePublishTheme
    loadFoliolePublishedTopics inspectFoliolePublishedDelete saveFoliolePublishDraft saveFoliolePublishSiteTitle
    connectFoliolePublishSettings updateFoliolePublishSiteAddress disconnectFoliolePublishSettings
    forgetFoliolePublishField resetFoliolePublishFieldHistory useFoliolePublishTheme updateFoliolePublishLocalPages
    openFoliolePublishCustomTheme previewFoliolePublishSite previewFoliolePublish loadDiscoursePublishSettings
    loadDiscoursePublishCatalog loadDiscoursePublishDraft saveDiscoursePublishSettings beginDiscourseUserApiAuthorization
    completeDiscourseUserApiAuthorization disconnectDiscoursePublishSettings saveDiscoursePublishDraft
    loadWordPressPublishSettings loadWordPressPublishCatalog saveWordPressPublishDraft connectWordPressPublishSettings
    disconnectWordPressPublishSettings
  `),
  /** Assistant conversations and model settings; work follows the conversation, not the library. */
  assistant: names(`
    assistantGetStatus assistantListModels assistantStartChatGptLogin assistantSendMessage assistantResolveWriteApproval
    assistantLinkThreadMaterial assistantUnlinkThreadMaterial assistantListThreadIndex assistantListThreadMessages
    assistantArchiveThreadIndex assistantRemoveThreadFromHistory assistantReadImageAttachment assistantGetStorageInfo
    assistantLoadModelSettings assistantLoadCustomInstructions assistantLoadAttachedContextSettings
    assistantLoadToolPermissions assistantLoadByokSettings assistantOpenStorageLocation assistantSaveModelDraft
    assistantTestModel assistantDeleteModel assistantSelectModel assistantSaveCustomInstructions
    assistantSaveAttachedContextSettings assistantSaveToolPermissions assistantSaveByokSettings assistantSetProvider
    assistantDisconnectByokSettings
  `),
  /** Window, system, dialog, update, diagnostic, local file or one named setting; not expected to read library content. */
  hostAndSettings: names(`
    loadArticleTargets selectArticleTarget openLocalPath selectLocalFileToOpen listLocalFiles readLocalFile saveLocalFile
    listCssSnippetFiles openCssSnippetFolder loadDatabaseUpgradeStatus appGetVersion folioleCliInstall
    appendReadingPositionTraceLog desktopUpdateCheck desktopUpdateDownload desktopUpdateInstall listSystemFonts
    loadDesktopHostCapabilities loadInitialLibrarySetup loadLoginItemSettings loadSplitTopicPreferences
    loadPerformanceMemorySnapshot openExternalUrl openGlobalCaptureAccessibilitySettings openImportPermissionSettings
    openSyncGroupLocalNetworkSettings openWindowsDefaultAppSettings openImportRoot chooseInitialLibraryLocation
    confirmInitialLibrarySetup desktopSupportLog copyDiagnosticReport resolveAppPaths clearLinkPanelBrowsingData
    setAppDisplayScale windowClose windowSidebarLayoutMetrics windowIsMaximized windowMinimize windowRestartDevApp
    windowRestartApp windowSetNativeControlsVisible windowToggleDevTools windowToggleMaximize syncAppMenuState
    loadSystemColorMode saveAppSettingsState loadSystemEntryDisplayNames saveSystemEntryDisplayNames
    loadSearchAliasFileStatus openSearchAliasFile loadReviewSchedulerSettings saveReviewSchedulerSettings
    saveLoginItemSettings saveSplitTopicPreferences desktopReminderNotificationStatus
    requestDesktopReminderNotificationPermission openDesktopReminderNotificationSettings loadDesktopReminders
    saveDesktopReminder
  `)
};
