import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeCssSnippetDirectory {
  path: string;
  files: Array<{ name: string; sourceCss: string | null }>;
}

export type NativeCssSnippetCommandMap = {
  [NATIVE_COMMANDS.listCssSnippetFiles]: { args: undefined; result: NativeCssSnippetDirectory };
  [NATIVE_COMMANDS.openCssSnippetFolder]: { args: undefined; result: null };
};
