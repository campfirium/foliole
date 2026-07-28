import { NATIVE_COMMANDS } from './nativeCommands.js';

export type SplitTopicDisposition = 'replace' | 'keep-as-parent';

export interface NativeSplitTopicPreferences {
  delimiter: string;
  disposition: SplitTopicDisposition;
  keepDelimiter: boolean;
}

export type NativeSplitTopicPreferencesCommandMap = {
  [NATIVE_COMMANDS.loadSplitTopicPreferences]: {
    args: undefined;
    result: NativeSplitTopicPreferences;
  };
  [NATIVE_COMMANDS.saveSplitTopicPreferences]: {
    args: NativeSplitTopicPreferences;
    result: NativeSplitTopicPreferences;
  };
};
