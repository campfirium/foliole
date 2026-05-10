import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookImportResetResult,
  NativeReadwiseBookEpubLoadResult,
  NativeReadwiseBooksInventory,
  NativeReadwiseDetectionResult,
  NativeReadwiseTokenConnection,
  NativeReadwiseTokenSyncResult
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
      tagKeyword: string;
    };
    result: NativeReadwiseDetectionResult;
  };
  [NATIVE_COMMANDS.loadReadwiseTokenConnection]: {
    args: undefined;
    result: NativeReadwiseTokenConnection;
  };
  [NATIVE_COMMANDS.connectReadwiseToken]: {
    args: { token: string };
    result: NativeReadwiseTokenConnection;
  };
  [NATIVE_COMMANDS.disconnectReadwiseToken]: {
    args: undefined;
    result: NativeReadwiseTokenConnection;
  };
  [NATIVE_COMMANDS.syncReadwiseTokenLibrary]: {
    args: undefined;
    result: NativeReadwiseTokenSyncResult;
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
