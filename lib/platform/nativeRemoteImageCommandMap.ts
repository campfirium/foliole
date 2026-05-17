import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeRemoteImageCommandMap = {
  [NATIVE_COMMANDS.loadRemoteImageSourceContext]: {
    args: { node_id?: string | null; source_url: string };
    result: {
      image_host: string | null;
      learned_source_origin: string | null;
      source: 'learned' | 'node' | 'none';
      source_origin: string | null;
    };
  };
  [NATIVE_COMMANDS.saveRemoteImageSourceOrigin]: {
    args: { source_url: string; source_website: string };
    result: {
      image_host: string | null;
      source_origin: string | null;
      status: 'invalid' | 'saved';
    };
  };
  [NATIVE_COMMANDS.forgetRemoteImageLearnedSource]: {
    args: { source_url: string };
    result: {
      image_host: string | null;
      status: 'forgotten' | 'invalid' | 'missing';
    };
  };
};
