import type { ImportManagerSettings } from '../core/import/importManagerSettings.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportCancelResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from './nativeImportContract.js';
import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookImportResetResult,
  NativeReadwiseBookEpubLoadResult,
  NativeReadwiseBooksInventory,
  NativeReadwiseDetectionSource,
  NativeReadwiseDetectionResult
} from './nativeReadwiseContract.js';

export type NativeReadwiseCommandMap = {
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
