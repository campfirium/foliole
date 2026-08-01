import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeDesktopUpdatePhase =
  | 'available'
  | 'checking'
  | 'downloading'
  | 'error'
  | 'idle'
  | 'not-applicable'
  | 'pending-asset'
  | 'ready'
  | 'restarting';

export type NativeDesktopUpdateErrorCode =
  | 'check-failed'
  | 'download-failed'
  | 'install-failed'
  | 'install-preparation-failed'
  | 'invalid-command-state';

export interface NativeDesktopUpdateState {
  errorCode?: NativeDesktopUpdateErrorCode | undefined;
  percent?: number | undefined;
  phase: NativeDesktopUpdatePhase;
  totalBytes?: number | undefined;
  transferredBytes?: number | undefined;
  version?: string | undefined;
}

export type NativeDesktopUpdateCommandMap = {
  [NATIVE_COMMANDS.desktopUpdateCheck]: {
    args: { targetVersion: string };
    result: NativeDesktopUpdateState;
  };
  [NATIVE_COMMANDS.desktopUpdateDownload]: {
    args: undefined;
    result: NativeDesktopUpdateState;
  };
  [NATIVE_COMMANDS.desktopUpdateInstall]: {
    args: undefined;
    result: NativeDesktopUpdateState;
  };
};
