import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeFoliolePublishSettings {
  account_id: string;
  credentials_valid: boolean;
  has_credentials: boolean;
  pages_url: string;
  project_name: string;
  site_address: string;
  updated_at: string | null;
  field_catalog: NativeFoliolePublishFieldCatalogEntry[];
}

export interface NativeFoliolePublishDraftInput {
  account_id: string;
  api_token: string;
  project_name: string;
}

export type NativeFoliolePublishFieldValue = string | string[];
export interface NativeFoliolePublishField { key: string; value: NativeFoliolePublishFieldValue }
export interface NativeFoliolePublishFieldCatalogEntry {
  key: string;
  multiple: boolean;
  recent_values: NativeFoliolePublishFieldValue[];
}

export interface NativeFoliolePublishThemeStatus {
  active_theme: 'custom' | 'foliole';
  custom_theme: { based_on_official_version: number | null } | null;
  official_theme_version: number;
}

export interface NativeFoliolePublishConnectInput {
  account_id: string;
  api_token: string;
  confirm_subdomain_risk?: boolean;
  project_name: string;
  site_address: string;
}

export type NativeFoliolePublishConnectResult =
  | { project_name: string; status: 'subdomain_unavailable' }
  | { settings: NativeFoliolePublishSettings; status: 'connected' };

export interface NativeFoliolePublishTopicArgs {
  content: string;
  fields: NativeFoliolePublishField[];
  node_id: string;
  title: string;
}

export interface NativeFoliolePublishResult {
  local_path: string;
  url: string | null;
  status: 'previewed' | 'deployed_and_committed' | 'deployed_history_failed' | 'deployed_local_publish_state_failed';
  updated_content: string | null;
  warning?: string;
}

export type NativeFoliolePublishCommandMap = {
  [NATIVE_COMMANDS.loadFoliolePublishSettings]: { args: undefined; result: NativeFoliolePublishSettings };
  [NATIVE_COMMANDS.loadFoliolePublishSiteTitle]: { args: undefined; result: { site_title: string } };
  [NATIVE_COMMANDS.saveFoliolePublishDraft]: {
    args: { settings: NativeFoliolePublishDraftInput };
    result: NativeFoliolePublishSettings;
  };
  [NATIVE_COMMANDS.saveFoliolePublishSiteTitle]: {
    args: { site_title: string };
    result: { site_title: string };
  };
  [NATIVE_COMMANDS.connectFoliolePublishSettings]: {
    args: { settings: NativeFoliolePublishConnectInput };
    result: NativeFoliolePublishConnectResult;
  };
  [NATIVE_COMMANDS.updateFoliolePublishSiteAddress]: {
    args: { site_address: string };
    result: NativeFoliolePublishSettings;
  };
  [NATIVE_COMMANDS.disconnectFoliolePublishSettings]: { args: undefined; result: NativeFoliolePublishSettings };
  [NATIVE_COMMANDS.forgetFoliolePublishField]: { args: { key: string }; result: NativeFoliolePublishSettings };
  [NATIVE_COMMANDS.resetFoliolePublishFieldHistory]: { args: undefined; result: NativeFoliolePublishSettings };
  [NATIVE_COMMANDS.loadFoliolePublishTheme]: { args: undefined; result: NativeFoliolePublishThemeStatus };
  [NATIVE_COMMANDS.openFoliolePublishCustomTheme]: {
    args: undefined;
    result: { local_path: string; theme: NativeFoliolePublishThemeStatus };
  };
  [NATIVE_COMMANDS.useFoliolePublishTheme]: {
    args: undefined;
    result: { theme: NativeFoliolePublishThemeStatus };
  };
  [NATIVE_COMMANDS.updateFoliolePublishLocalPages]: { args: undefined; result: { local_path: string } };
  [NATIVE_COMMANDS.publishFoliolePublishThemeChanges]: { args: undefined; result: { local_path: string } };
  [NATIVE_COMMANDS.previewFoliolePublishSite]: { args: undefined; result: NativeFoliolePublishResult };
  [NATIVE_COMMANDS.previewFoliolePublish]: { args: NativeFoliolePublishTopicArgs; result: NativeFoliolePublishResult };
  [NATIVE_COMMANDS.publishTopicToFoliole]: {
    args: NativeFoliolePublishTopicArgs;
    result: NativeFoliolePublishResult;
  };
};
