import type { FullTextSearchIndexStrategy } from '../core/database/fullTextSearchIndexStrategy.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeSearchIndexRebuildStatus {
  error?: string;
  status: 'failed' | 'ready' | 'rebuilding';
  strategy: FullTextSearchIndexStrategy;
}

export type NativeSearchIndexCommandMap = {
  [NATIVE_COMMANDS.loadSearchAliasFileStatus]: {
    args: undefined;
    result: { error: string | null; path: string };
  };
  [NATIVE_COMMANDS.openSearchAliasFile]: {
    args: undefined;
    result: { error: string | null; path: string };
  };
  [NATIVE_COMMANDS.loadSearchIndexRebuildStatus]: {
    args: undefined;
    result: NativeSearchIndexRebuildStatus | null;
  };
  [NATIVE_COMMANDS.rebuildSearchIndex]: {
    args: {
      strategy: FullTextSearchIndexStrategy;
    };
    result: NativeSearchIndexRebuildStatus;
  };
};
