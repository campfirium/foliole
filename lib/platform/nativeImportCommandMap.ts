import type { ImportManagerSettings } from '../core/import/importManagerSettings.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeDirectoryImportArgs,
  NativeDirectoryImportResult,
  NativeDevReimportCurrentTopicSourceResult,
  NativeImportedTextFile,
  NativeImportOverview,
  NativeNodeSourceDetails,
  NativePdfImportsInventory,
  NativeTextImportArgs,
  NativeTextImportResult
} from './nativeImportContract.js';
import type { NativeKeepImportPreviewArgs, NativeKeepImportPreviewResult } from './nativeKeepImportContract.js';
import type { NativeRestoreRemovedSourceArgs, NativeRestoreRemovedSourceResult, NativeRemovedSourcesResult } from './nativeRemovedSourcesContract.js';
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
      incoming_update_id?: string;
      kind?: 'incoming_update' | 'source_update';
      source_node_id: string;
      updated_content: string;
    } | null;
  };
  [NATIVE_COMMANDS.acceptIncomingUpdate]: {
    args: { incoming_update_id: string; content: string };
    result: { incoming_update_id: string; node_id: string | null; status: 'accepted' | 'unavailable' };
  };
  [NATIVE_COMMANDS.dismissIncomingUpdate]: {
    args: { incoming_update_id: string };
    result: { incoming_update_id: string; node_id: string | null; status: 'dismissed' | 'unavailable' };
  };
  [NATIVE_COMMANDS.importIncomingUpdateAsNew]: {
    args: { incoming_update_id: string };
    result: { incoming_update_id: string; node_id: string | null; status: 'imported_as_new' | 'unavailable' };
  };
  [NATIVE_COMMANDS.mergeReadwiseTopicHighlights]: {
    args: { node_id: string };
    result: NativeMergeReadwiseTopicHighlightsResult;
  };
  [NATIVE_COMMANDS.loadImportOverview]: {
    args: undefined;
    result: NativeImportOverview;
  };
  [NATIVE_COMMANDS.loadRemovedSources]: {
    args: undefined;
    result: NativeRemovedSourcesResult;
  };
  [NATIVE_COMMANDS.restoreRemovedSource]: {
    args: NativeRestoreRemovedSourceArgs;
    result: NativeRestoreRemovedSourceResult;
  };
  [NATIVE_COMMANDS.devReimportCurrentTopicSource]: {
    args: { node_id: string };
    result: NativeDevReimportCurrentTopicSourceResult;
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
