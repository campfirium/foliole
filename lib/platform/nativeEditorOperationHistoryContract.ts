import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeEditorOperationHistoryCommandMap {
  [NATIVE_COMMANDS.loadEditorOperationHistory]: {
    args: undefined;
    result: string | null;
  };
  [NATIVE_COMMANDS.saveEditorOperationHistory]: {
    args: { payloadJson: string };
    result: null;
  };
}
