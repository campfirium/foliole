import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import type { WorkspaceRuntimeNodeDocument } from './workspaceRuntimeTypes';

export async function loadWorkspaceNodeDocumentFromRuntime(nodeId: string): Promise<WorkspaceRuntimeNodeDocument | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadNodeDocument, { nodeId });
}
