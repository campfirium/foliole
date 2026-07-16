export interface NativeDiscoursePublishSettings {
  has_api_key: boolean;
  site_url: string;
  updated_at: string | null;
}

export interface NativeDiscoursePublishSettingsInput {
  api_key?: string;
  site_url: string;
}

export interface NativeDiscoursePublishArgs {
  category_id: number | null;
  content: string;
  tags: string[];
  title: string;
}

export interface NativeDiscoursePublishCategory {
  id: number;
  name: string;
  parent_category_id: number | null;
  slug: string;
}

export interface NativeDiscoursePublishTag {
  id: string;
  name: string;
}

export interface NativeDiscoursePublishCatalog {
  categories: NativeDiscoursePublishCategory[];
  fetched_at: string | null;
  from_cache: boolean;
  recent_category_ids: number[];
  recent_tags: string[];
  tags: NativeDiscoursePublishTag[];
}

export interface NativeDiscoursePublishResult {
  mode: 'created' | 'updated';
  post_id: number;
  topic_id: number;
  updated_content: string;
  url: string;
}

export type NativeDiscoursePublishCommandMap = {
  [NATIVE_COMMANDS.loadDiscoursePublishSettings]: {
    args: undefined;
    result: NativeDiscoursePublishSettings;
  };
  [NATIVE_COMMANDS.saveDiscoursePublishSettings]: {
    args: { settings: NativeDiscoursePublishSettingsInput };
    result: NativeDiscoursePublishSettings;
  };
  [NATIVE_COMMANDS.disconnectDiscoursePublishSettings]: {
    args: undefined;
    result: NativeDiscoursePublishSettings;
  };
  [NATIVE_COMMANDS.loadDiscoursePublishCatalog]: {
    args: { refresh?: boolean } | undefined;
    result: NativeDiscoursePublishCatalog;
  };
  [NATIVE_COMMANDS.publishTopicToDiscourse]: {
    args: NativeDiscoursePublishArgs;
    result: NativeDiscoursePublishResult;
  };
};
import { NATIVE_COMMANDS } from './nativeCommands.js';
