import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeLocalFileEntry {
  absolutePath: string;
  cursorFrom: number | null;
  cursorTo: number | null;
  fileSize: number | null;
  id: string;
  lastOpenedAt: string;
  missingAt: string | null;
  modifiedAt: string | null;
  title: string;
}

export interface NativeLocalFileDocument extends NativeLocalFileEntry {
  content: string;
  status: 'ready';
}

export type NativeLocalFileReadResult =
  | NativeLocalFileDocument
  | {
      absolutePath: string;
      missingAt: string;
      status: 'missing';
      title: string;
    }
  | {
      absolutePath: string;
      errorCode: 'unsupported_extension' | 'not_a_file' | 'read_failed';
      message: string;
      status: 'error';
    };

export type NativeLocalFileSaveResult =
  | {
      fileSize: number;
      modifiedAt: string;
      status: 'saved';
    }
  | {
      fileSize: number;
      modifiedAt: string;
      status: 'conflict';
    }
  | {
      errorCode: 'missing' | 'write_failed' | 'unsupported_extension';
      message: string;
      status: 'error';
    };

export type NativeLocalFileCommandMap = {
  [NATIVE_COMMANDS.listLocalFiles]: {
    args: undefined;
    result: NativeLocalFileEntry[];
  };
  [NATIVE_COMMANDS.readLocalFile]: {
    args: { path: string };
    result: NativeLocalFileReadResult;
  };
  [NATIVE_COMMANDS.saveLocalFile]: {
    args: {
      content: string;
      expectedFileSize?: number | null;
      expectedModifiedAt?: string | null;
      force?: boolean;
      path: string;
    };
    result: NativeLocalFileSaveResult;
  };
};
