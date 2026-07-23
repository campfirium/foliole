import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeWordPressPublishAdapter = 'core_rest' | 'wordpress_com_xmlrpc';
export type NativeWordPressPostStatus = 'draft' | 'publish';

export interface NativeWordPressPublishSettings {
  adapter: NativeWordPressPublishAdapter | null;
  credentials_valid: boolean;
  has_credentials: boolean;
  site_url: string;
  updated_at: string | null;
  username: string;
}

export interface NativeWordPressDraftInput {
  application_password: string;
  site_url: string;
  username: string;
}

export type NativeWordPressConnectInput = NativeWordPressDraftInput;

export interface NativeWordPressPublishCategory {
  id: number;
  name: string;
  parent_category_id: number | null;
  slug: string;
}

export interface NativeWordPressPublishTag {
  id: number;
  name: string;
  slug: string;
}

export interface NativeWordPressPublishCatalog {
  categories: NativeWordPressPublishCategory[];
  fetched_at: string | null;
  from_cache: boolean;
  selected_category_id: number | null;
  selected_tags: string[];
  tags: NativeWordPressPublishTag[];
}

export interface NativeWordPressPublishTagSelection {
  id: number | null;
  name: string;
}

export interface NativeWordPressPublishCategorySelection {
  id: number | null;
  name: string;
}

export interface NativeWordPressPublishArgs {
  category: NativeWordPressPublishCategorySelection | null;
  content: string;
  status: NativeWordPressPostStatus;
  tags: NativeWordPressPublishTagSelection[];
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
  [NATIVE_COMMANDS.saveWordPressPublishDraft]: {
    args: { settings: NativeWordPressDraftInput };
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
  [NATIVE_COMMANDS.loadWordPressPublishCatalog]: {
    args: { post_id?: string; refresh?: boolean } | undefined;
    result: NativeWordPressPublishCatalog;
  };
  [NATIVE_COMMANDS.publishTopicToWordPress]: {
    args: NativeWordPressPublishArgs;
    result: NativeWordPressPublishResult;
  };
};
