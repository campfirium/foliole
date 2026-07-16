import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeInitialLibrarySetupState {
  display_path: string;
  library_home: string;
  requires_system_confirmation: boolean;
}

export type NativeInitialLibraryLocationResult =
  | { status: 'canceled' }
  | { state: NativeInitialLibrarySetupState; status: 'selected' };

export type NativeInitialLibraryConfirmationResult =
  | { status: 'canceled' }
  | { status: 'confirmed' };

export type NativeInitialLibrarySetupCommandMap = {
  [NATIVE_COMMANDS.loadInitialLibrarySetup]: {
    args: undefined;
    result: NativeInitialLibrarySetupState;
  };
  [NATIVE_COMMANDS.chooseInitialLibraryLocation]: {
    args: undefined;
    result: NativeInitialLibraryLocationResult;
  };
  [NATIVE_COMMANDS.confirmInitialLibrarySetup]: {
    args: undefined;
    result: NativeInitialLibraryConfirmationResult;
  };
};
