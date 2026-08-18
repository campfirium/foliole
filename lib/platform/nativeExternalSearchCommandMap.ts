import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview,
  NativeExternalSearchReconnectPreview
} from './nativeExternalSearchContract.js';
import type { NativeTextImportResult } from './nativeImportContract.js';


export type NativeExternalSearchCommandMap = {
  [NATIVE_COMMANDS.loadExternalSearchFolders]: {
    args: undefined;
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.saveExternalSearchFolders]: {
    args: {
      folders: Array<Pick<NativeExternalSearchFolder, 'attachment_mode' | 'attachment_root_path' | 'excluded_dirs' | 'folder_path' | 'id'> & {
        claim_unowned?: boolean;
      }>;
    };
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.removeExternalSearchFolder]: {
    args: { folder_id: string };
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.disconnectExternalSearchFolder]: {
    args: { folder_id: string };
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.previewExternalSearchFolderReconnect]: {
    args: { folder_id: string; folder_path: string };
    result: NativeExternalSearchReconnectPreview;
  };
  [NATIVE_COMMANDS.reconnectExternalSearchFolder]: {
    args: { folder_id: string; folder_path: string };
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.rebuildExternalSearchIndex]: {
    args: {
      folder_id?: string;
    } | undefined;
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.loadExternalSearchBrowseEntries]: {
    args: {
      folder_id: string;
    };
    result: NativeExternalSearchBrowseEntry[];
  };
  [NATIVE_COMMANDS.loadExternalSearchPreview]: {
    args: { absolute_path: string; document_id?: never } | { absolute_path?: never; document_id: string };
    result: NativeExternalSearchPreview | null;
  };
  [NATIVE_COMMANDS.openExternalDocumentFile]: {
    args: {
      path: string;
    };
    result: NativeExternalSearchBrowseEntry | null;
  };
  [NATIVE_COMMANDS.importExternalSearchDocument]: {
    args: ({
      absolute_path: string;
      document_id?: never;
    } | {
      absolute_path?: never;
      document_id: string;
    }) & {
      title_strategy?: 'file_name' | 'heading';
    };
    result: NativeTextImportResult | null;
  };
};
