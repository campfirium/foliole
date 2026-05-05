import type { ImportManagerSettings } from '../core/import/importManagerSettings.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeDirectoryImportArgs,
  NativeDirectoryImportResult,
  NativeImportedTextFile,
  NativeImportOverview,
  NativeKeepImportPreviewArgs,
  NativeKeepImportPreviewResult,
  NativeNodeSourceDetails,
  NativePdfImportsInventory,
  NativeTextImportArgs,
  NativeTextImportResult
} from './nativeImportContract.js';
import type { NativeMergeReadwiseTopicHighlightsResult } from './nativeStorageContract.js';

export type NativeImportCommandMap = {
  [NATIVE_COMMANDS.runTextFileImport]: {
    args: NativeTextImportArgs;
    result: NativeTextImportResult | null;
  };
  [NATIVE_COMMANDS.runClipboardImport]: { args: NativeTextImportArgs; result: NativeTextImportResult | null };
  [NATIVE_COMMANDS.runDirectoryImport]: {
    args: NativeDirectoryImportArgs;
    result: NativeDirectoryImportResult | null;
  };
  [NATIVE_COMMANDS.previewKeepImportRule]: {
    args: NativeKeepImportPreviewArgs;
    result: NativeKeepImportPreviewResult;
  };
  [NATIVE_COMMANDS.loadNodeSourceDetails]: {
    args: { node_id: string };
    result: NativeNodeSourceDetails | null;
  };
  [NATIVE_COMMANDS.loadNodeSourceUpdatePreview]: {
    args: { node_id: string };
    result: {
      checked_at: string;
      current_content: string;
      source_node_id: string;
      updated_content: string;
    } | null;
  };
  [NATIVE_COMMANDS.mergeReadwiseTopicHighlights]: {
    args: { node_id: string };
    result: NativeMergeReadwiseTopicHighlightsResult;
  };
  [NATIVE_COMMANDS.loadImportOverview]: {
    args: undefined;
    result: NativeImportOverview;
  };
  [NATIVE_COMMANDS.loadPdfImportsInventory]: {
    args: undefined;
    result: NativePdfImportsInventory;
  };
  [NATIVE_COMMANDS.loadImportManagerSettings]: {
    args: undefined;
    result: ImportManagerSettings;
  };
  [NATIVE_COMMANDS.selectImportTextFile]: {
    args: NativeTextImportArgs;
    result: NativeImportedTextFile | null;
  };
  [NATIVE_COMMANDS.selectImportDirectory]: {
    args: undefined;
    result: string | null;
  };
  [NATIVE_COMMANDS.saveImportManagerSettings]: {
    args: { settings: ImportManagerSettings };
    result: ImportManagerSettings;
  };
};
