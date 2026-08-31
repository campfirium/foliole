import type { NativeAssistantProviderId } from './nativeAssistantContract.js';
import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeAssistantByokConfigurationState =
  | 'configured'
  | 'not_configured'
  | 'secure_storage_unavailable';

export interface NativeAssistantByokSettings {
  endpoint: string;
  has_api_key: boolean;
  model: string;
  selected_provider: NativeAssistantProviderId;
  state: NativeAssistantByokConfigurationState;
}

export interface NativeAssistantByokSettingsInput {
  api_key?: string;
  endpoint: string;
  model: string;
}

export type NativeAssistantByokCommandMap = {
  [NATIVE_COMMANDS.assistantLoadByokSettings]: {
    args: undefined;
    result: NativeAssistantByokSettings;
  };
  [NATIVE_COMMANDS.assistantSaveByokSettings]: {
    args: NativeAssistantByokSettingsInput;
    result: NativeAssistantByokSettings;
  };
  [NATIVE_COMMANDS.assistantDisconnectByokSettings]: {
    args: undefined;
    result: NativeAssistantByokSettings;
  };
  [NATIVE_COMMANDS.assistantSetProvider]: {
    args: { provider: NativeAssistantProviderId };
    result: NativeAssistantByokSettings;
  };
};
