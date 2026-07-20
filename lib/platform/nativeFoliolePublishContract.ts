import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeFoliolePublishSettings {
  account_id: string;
  has_credentials: boolean;
  pages_url: string;
  project_name: string;
  site_address: string;
  updated_at: string | null;
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
  | { project_name: string; status: 'subdomain_detected' | 'subdomain_not_detected' }
  | { settings: NativeFoliolePublishSettings; status: 'connected' };

export interface NativeFoliolePublishTopicArgs {
  content: string;
  node_id: string;
  title: string;
}

export interface NativeFoliolePublishResult {
  local_path: string;
  url: string | null;
}

export type NativeFoliolePublishCommandMap = {
  [NATIVE_COMMANDS.loadFoliolePublishSettings]: { args: undefined; result: NativeFoliolePublishSettings };
  [NATIVE_COMMANDS.connectFoliolePublishSettings]: {
    args: { settings: NativeFoliolePublishConnectInput };
    result: NativeFoliolePublishConnectResult;
  };
  [NATIVE_COMMANDS.updateFoliolePublishSiteAddress]: {
    args: { site_address: string };
    result: NativeFoliolePublishSettings;
  };
  [NATIVE_COMMANDS.disconnectFoliolePublishSettings]: { args: undefined; result: NativeFoliolePublishSettings };
  [NATIVE_COMMANDS.previewFoliolePublish]: { args: undefined; result: NativeFoliolePublishResult };
  [NATIVE_COMMANDS.publishTopicToFoliole]: {
    args: NativeFoliolePublishTopicArgs;
    result: NativeFoliolePublishResult;
  };
};
