import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeWordPressPublishAdapter = 'core_rest' | 'wordpress_com_xmlrpc';
export type NativeWordPressPostStatus = 'draft' | 'publish';

export interface NativeWordPressPublishSettings {
  adapter: NativeWordPressPublishAdapter | null;
  has_credentials: boolean;
  site_url: string;
  updated_at: string | null;
}

export interface NativeWordPressConnectInput {
  application_password: string;
  site_url: string;
  username: string;
}

export interface NativeWordPressPublishArgs {
  content: string;
  status: NativeWordPressPostStatus;
  title: string;
}

export interface NativeWordPressPublishResult {
  mode: 'created' | 'updated';
  post_id: string;
  updated_content: string;
  url: string;
}

export type NativeWordPressPublishCommandMap = {
  [NATIVE_COMMANDS.loadWordPressPublishSettings]: {
    args: undefined;
    result: NativeWordPressPublishSettings;
  };
  [NATIVE_COMMANDS.connectWordPressPublishSettings]: {
    args: { settings: NativeWordPressConnectInput };
    result: NativeWordPressPublishSettings;
  };
  [NATIVE_COMMANDS.disconnectWordPressPublishSettings]: {
    args: undefined;
    result: NativeWordPressPublishSettings;
  };
  [NATIVE_COMMANDS.publishTopicToWordPress]: {
    args: NativeWordPressPublishArgs;
    result: NativeWordPressPublishResult;
  };
};
