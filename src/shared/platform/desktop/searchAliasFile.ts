import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

function requireRuntime() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Desktop search aliases are unavailable.');
  return invoke;
}

export function loadSearchAliasFileStatus() {
  return requireRuntime()(NATIVE_COMMANDS.loadSearchAliasFileStatus);
}

export function openSearchAliasFile() {
  return requireRuntime()(NATIVE_COMMANDS.openSearchAliasFile);
}
