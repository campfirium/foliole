import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeLocalFileReadResult,
  NativeLocalFileSaveResult
} from '../../../lib/platform/nativeLocalFileCommandMap';

import { getRuntimeInvoke } from './runtimeInvoke';

function requireRuntimeInvoke() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('Local files require the desktop runtime.');
  }
  return runtimeInvoke;
}

export async function readLocalFile(path: string): Promise<NativeLocalFileReadResult> {
  return requireRuntimeInvoke()(NATIVE_COMMANDS.readLocalFile, { path });
}

export async function saveLocalFile(args: {
  content: string;
  expectedFileSize?: number | null;
  expectedModifiedAt?: string | null;
  force?: boolean;
  path: string;
  updateSearchIndex?: boolean;
}): Promise<NativeLocalFileSaveResult> {
  return requireRuntimeInvoke()(NATIVE_COMMANDS.saveLocalFile, args);
}
