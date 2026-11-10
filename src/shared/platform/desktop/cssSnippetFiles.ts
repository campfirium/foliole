import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

function requireRuntime() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('CSS snippet files are unavailable.');
  return invoke;
}

export async function listCssSnippetFiles() {
  return requireRuntime()(NATIVE_COMMANDS.listCssSnippetFiles);
}

export async function openCssSnippetFolder() {
  return requireRuntime()(NATIVE_COMMANDS.openCssSnippetFolder);
}
