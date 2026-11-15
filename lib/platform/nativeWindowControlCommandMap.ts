import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeWindowControlCommandMap = {
  [NATIVE_COMMANDS.windowClose]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowSidebarLayoutMetrics]: {
    args: undefined;
    result: { windowWidth: number; workAreaWidth: number } | null;
  };
  [NATIVE_COMMANDS.windowIsMaximized]: {
    args: undefined;
    result: boolean;
  };
  [NATIVE_COMMANDS.windowMinimize]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowRestartApp]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowRestartDevApp]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowSetNativeControlsVisible]: {
    args: { visible: boolean };
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleDevTools]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleMaximize]: {
    args: undefined;
    result: null;
  };
};
