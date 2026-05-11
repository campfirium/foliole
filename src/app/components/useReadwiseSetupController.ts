import {
  isReadwiseReaderConfigReady,
  type ReadwiseReaderConfig
} from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeContract';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetupInspection';
import { useReadwiseManualSync } from './useReadwiseManualSync';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';
import {
  createReadwiseSetupPayload,
  disableReadwiseImportSource,
  type ReadwiseSetupPayload,
  useReadwiseSyncPreviewFlow
} from './useReadwiseSyncPreviewFlow';

export type { ReadwiseSetupPayload } from './useReadwiseSyncPreviewFlow';

interface SettingsReadwiseReaderContentProps {
  config: ReadwiseReaderConfig;
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
  onSave: (input: ReadwiseSetupPayload) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

function canPreviewReadwiseSetup(input: {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  return (
    input.readwiseRootPath.trim().length > 0 &&
    input.readwiseSources.some((source) => source.kind) &&
    input.readwiseSources.every(
      (source) => !source.kind || Boolean(source.highlightPath.trim() && source.primaryPath.trim())
    ) &&
    input.config.highlightsHeading.trim().length > 0 &&
    input.config.newHighlightsHeading.trim().length > 0 &&
    input.config.highlightSeparator.trim().length > 0 &&
    input.config.tagKeyword.trim().length > 0 &&
    input.config.noteKeyword.trim().length > 0
  );
}

function useReadwiseDraftController(props: SettingsReadwiseReaderContentProps) {
  const draft = useReadwiseSetupDraft({
    config: props.config,
    onPreview: (input) =>
      inspectReadwiseReaderSetup({
        articleDirectoryPath: input.articleDirectoryPath,
        config: input.config,
        fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
        sources: input.sources
      }),
    open: true,
    readwiseRootPath: props.readwiseRootPath,
    readwiseSources: props.readwiseSources
  });
  return {
    canPreview: canPreviewReadwiseSetup({
      config: draft.draftConfig,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources: draft.draftSources
    }),
    draft
  };
}

function resolveReadwiseIntegrationState(input: {
  config: ReadwiseReaderConfig;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  readwiseRootPath: string;
}) {
  const configured =
    input.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(input.config);
  const integrationEnabled = input.config.enabled;
  const canChangeIntegration =
    integrationEnabled ||
    Boolean(input.draft.previewResult?.success) ||
    (configured && !input.draft.hasDraftChanges);
  return {
    canChangeIntegration,
    integrationEnabled
  };
}

function saveReadwiseSetup(input: {
  config: ReadwiseReaderConfig;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  onSave: SettingsReadwiseReaderContentProps['onSave'];
  readwiseSources: DraftImportSource[];
}) {
  input.onSave(createReadwiseSetupPayload(input.draft, input.config, input.readwiseSources));
}

function createReadwiseControllerHandlers(input: {
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  integration: ReturnType<typeof resolveReadwiseIntegrationState>;
  onSave: SettingsReadwiseReaderContentProps['onSave'];
  sync: ReturnType<typeof useReadwiseSyncPreviewFlow>;
}) {
  return {
    handleChangeIntegration() {
      if (input.integration.integrationEnabled) {
        saveReadwiseSetup({
          config: { ...input.draft.draftConfig, enabled: false },
          draft: input.draft,
          onSave: input.onSave,
          readwiseSources: disableReadwiseImportSource(input.draft.draftSources)
        });
        return;
      }
      if (!input.integration.canChangeIntegration) {
        input.sync.openBlockedPreview(
          'Import preview needs to be run and confirmed before Readwise import can be turned on.'
        );
        return;
      }
      void input.sync.openSyncPreview('enable');
    },
    handleCheck() {
      saveReadwiseSetup({
        config: input.draft.draftConfig,
        draft: input.draft,
        onSave: input.onSave,
        readwiseSources: input.draft.draftSources
      });
      void input.draft.runPreview();
    }
  };
}

export function useReadwiseSetupController(props: SettingsReadwiseReaderContentProps) {
  const { canPreview, draft } = useReadwiseDraftController(props);
  const sync = useReadwiseSyncPreviewFlow({
    draft,
    onPreviewSync: props.onPreviewSync,
    onRunSync: props.onRunSync,
    onSave: props.onSave
  });
  const manualSync = useReadwiseManualSync({
    draft,
    onRunSync: props.onRunSync,
    onSave: props.onSave
  });
  const integration = resolveReadwiseIntegrationState({
    config: props.config,
    draft,
    readwiseRootPath: props.readwiseRootPath
  });
  const handlers = createReadwiseControllerHandlers({
    draft,
    integration,
    onSave: props.onSave,
    sync
  });

  return {
    ...integration,
    canPreview,
    closeSyncPreview: sync.closeSyncPreview,
    draft,
    handleChangeIntegration: handlers.handleChangeIntegration,
    handleCheck: handlers.handleCheck,
    handleRunSync: () => {
      if (draft.hasDraftChanges) {
        void sync.openSyncPreview('sync');
        return;
      }
      void manualSync.runManualSync();
    },
    isStartingSync: sync.isStartingSync,
    isSyncPreviewing: sync.isSyncPreviewing,
    manualSyncStatus: manualSync.manualSyncStatus,
    startSync: sync.startSync,
    syncDisabled: !integration.integrationEnabled || !props.onRunSync || manualSync.isManualSyncing,
    syncError: sync.syncError,
    syncIntent: sync.syncIntent,
    syncIsRunning: manualSync.isManualSyncing,
    syncNotice: sync.syncNotice,
    syncPreview: sync.syncPreview
  };
}
