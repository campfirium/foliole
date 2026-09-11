import type { ImportManagerSettings } from '../core/import/importManagerSettings.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from './nativeImportContract.js';
import type {
  NativeReadwiseApiConnection,
  NativeReadwiseApiConnectionResult
} from './nativeReadwiseApiConnectionContract.js';
import type { NativeReadwiseImportCancelResult } from './nativeReadwiseApiImportContract.js';
import type {
  NativeReadwiseApiScheduleStatus,
  NativeReadwiseReconcileCancelResult,
  NativeReadwiseReconcileResult
} from './nativeReadwiseApiImportContract.js';
import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookImportResetResult,
  NativeReadwiseBookEpubLoadResult,
  NativeReadwiseBooksInventory,
  NativeReadwiseDetectionSource,
  NativeReadwiseDetectionResult
} from './nativeReadwiseContract.js';
import type { NativeReadwiseHostAssignment } from './nativeReadwiseHostContract.js';
import type {
  NativeReadwiseIdentityBindingPreview,
  NativeReadwiseIdentityBindingResult
} from './nativeReadwiseIdentityContract.js';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from './nativeReadwiseSourceCutoverContract.js';

export type NativeReadwiseCommandMap = {
  [NATIVE_COMMANDS.loadReadwiseApiConnection]: {
    args: undefined;
    result: NativeReadwiseApiConnection;
  };
  [NATIVE_COMMANDS.loadReadwiseApiScheduleStatus]: {
    args: undefined;
    result: NativeReadwiseApiScheduleStatus;
  };
  [NATIVE_COMMANDS.connectReadwiseApiFromClipboard]: {
    args: { connection_intent?: 'migration' | 'normal'; source_intent?: 'continue' | 'replace' } | undefined;
    result: NativeReadwiseApiConnectionResult;
  };
  [NATIVE_COMMANDS.previewReadwiseSourceCutover]: {
    args: undefined;
    result: NativeReadwiseSourceCutoverPreview;
  };
  [NATIVE_COMMANDS.runReadwiseSourceCutover]: {
    args: undefined;
    result: NativeReadwiseSourceCutoverResult;
  };
  [NATIVE_COMMANDS.disconnectReadwiseApi]: {
    args: undefined;
    result: NativeReadwiseApiConnectionResult;
  };
  [NATIVE_COMMANDS.previewReadwiseIdentityBindings]: {
    args: undefined;
    result: NativeReadwiseIdentityBindingPreview;
  };
  [NATIVE_COMMANDS.confirmReadwiseIdentityBindings]: {
    args: { preview_id: string };
    result: NativeReadwiseIdentityBindingResult;
  };
  [NATIVE_COMMANDS.loadReadwiseHostAssignment]: {
    args: undefined;
    result: NativeReadwiseHostAssignment;
  };
  [NATIVE_COMMANDS.activateReadwiseOnThisHost]: {
    args: undefined;
    result: NativeReadwiseHostAssignment;
  };
  [NATIVE_COMMANDS.inspectReadwiseReaderSetup]: {
    args: {
      articleDirectoryPath: string;
      fullDocumentDirectoryPath: string;
      highlightsHeading: string;
      highlightSeparator: string;
      newHighlightsHeading: string;
      noteKeyword: string;
      sources?: NativeReadwiseDetectionSource[];
      tagKeyword: string;
    };
    result: NativeReadwiseDetectionResult;
  };
  [NATIVE_COMMANDS.previewReadwiseReaderImport]: {
    args: { settings?: ImportManagerSettings } | undefined;
    result: NativeReadwiseSyncPreviewResult;
  };
  [NATIVE_COMMANDS.runReadwiseReaderImport]: {
    args: { settings?: ImportManagerSettings } | undefined;
    result: NativeReadwiseImportRunResult;
  };
  [NATIVE_COMMANDS.cancelReadwiseReaderImport]: {
    args: undefined;
    result: NativeReadwiseImportCancelResult;
  };
  [NATIVE_COMMANDS.runReadwiseApiReconcile]: {
    args: undefined;
    result: NativeReadwiseReconcileResult;
  };
  [NATIVE_COMMANDS.cancelReadwiseApiReconcile]: {
    args: undefined;
    result: NativeReadwiseReconcileCancelResult;
  };
  [NATIVE_COMMANDS.previewReadwiseImportCleanup]: {
    args: undefined;
    result: NativeReadwiseCleanupPreviewResult;
  };
  [NATIVE_COMMANDS.runReadwiseImportCleanup]: {
    args: undefined;
    result: NativeReadwiseCleanupRunResult;
  };
  [NATIVE_COMMANDS.loadReadwiseBooksInventory]: {
    args: undefined;
    result: NativeReadwiseBooksInventory;
  };
  [NATIVE_COMMANDS.openReadwiseBookDownload]: {
    args: {
      node_id: string;
    };
    result: NativeReadwiseBookDownloadResult;
  };
  [NATIVE_COMMANDS.loadReadwiseBookEpub]: {
    args: {
      node_id: string;
    };
    result: NativeReadwiseBookEpubLoadResult;
  };
  [NATIVE_COMMANDS.resetReadwiseBookImport]: {
    args: {
      node_id: string;
    };
    result: NativeReadwiseBookImportResetResult;
  };
};
