import { NATIVE_COMMANDS } from './nativeCommands.js';
import type { NativeExternalSearchFolder, NativeExternalSearchPreview } from './nativeExternalSearchContract.js';
import type { NativeTextImportResult } from './nativeImportContract.js';


export type NativeExternalSearchCommandMap = {
  [NATIVE_COMMANDS.loadExternalSearchFolders]: {
    args: undefined;
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.saveExternalSearchFolders]: {
    args: {
      folders: Array<Pick<NativeExternalSearchFolder, 'attachment_mode' | 'attachment_root_path' | 'excluded_dirs' | 'folder_path' | 'id'>>;
    };
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.rebuildExternalSearchIndex]: {
    args: {
      folder_id?: string;
    } | undefined;
    result: NativeExternalSearchFolder[];
  };
  [NATIVE_COMMANDS.loadExternalSearchPreview]: {
    args: {
      absolute_path: string;
    };
    result: NativeExternalSearchPreview | null;
  };
  [NATIVE_COMMANDS.importExternalSearchDocument]: {
    args: {
      absolute_path: string;
      title_strategy?: 'file_name' | 'heading';
    };
    result: NativeTextImportResult | null;
  };
};
