import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookImportResetResult,
  NativeReadwiseBookEpubLoadResult,
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
      tagKeyword: string;
    };
    result: NativeReadwiseDetectionResult;
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
