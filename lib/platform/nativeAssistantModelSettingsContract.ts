import type { NativeAssistantFailureCategory } from './nativeAssistantContract.js';
import { NATIVE_COMMANDS } from './nativeCommands.js';

export const NATIVE_ASSISTANT_CODEX_MODEL_ID = 'codex';
export const CURRENT_ASSISTANT_MODEL_TOOL_CONTRACT_VERSION = 1;

export type NativeAssistantCustomModelState =
  | 'configured'
  | 'not_configured'
  | 'secure_storage_unavailable';

export interface NativeAssistantCustomModel {
  endpoint: string;
  has_api_key: boolean;
  id: string;
  model: string;
  state: NativeAssistantCustomModelState;
  tool_contract_version: number;
}

export interface NativeAssistantModelSettings {
  models: NativeAssistantCustomModel[];
  selected_model_id: string;
}

export interface NativeAssistantModelInput {
  api_key?: string;
  endpoint: string;
  id?: string;
  model: string;
}

export interface NativeAssistantModelDraftInput {
  api_key?: string;
  endpoint: string;
  id: string;
  model: string;
}

export type NativeAssistantModelTestResult =
  | { settings: NativeAssistantModelSettings; state: 'ready' }
  | {
      failure: { category: NativeAssistantFailureCategory };
      settings: NativeAssistantModelSettings;
      state: 'failed';
    };

export type NativeAssistantModelSettingsCommandMap = {
  [NATIVE_COMMANDS.assistantLoadModelSettings]: {
    args: undefined;
    result: NativeAssistantModelSettings;
  };
  [NATIVE_COMMANDS.assistantSaveModelDraft]: {
    args: NativeAssistantModelDraftInput;
    result: NativeAssistantModelSettings;
  };
  [NATIVE_COMMANDS.assistantTestModel]: {
    args: NativeAssistantModelInput;
    result: NativeAssistantModelTestResult;
  };
  [NATIVE_COMMANDS.assistantDeleteModel]: {
    args: { id: string };
    result: NativeAssistantModelSettings;
  };
  [NATIVE_COMMANDS.assistantSelectModel]: {
    args: { id: string };
    result: NativeAssistantModelSettings;
  };
};
