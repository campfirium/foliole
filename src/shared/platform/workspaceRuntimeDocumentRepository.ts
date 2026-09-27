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

export async function retainWorkspaceEditorBase(nodeId: string, versionId: string, holdId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('workspace_editor_base_runtime_unavailable');
  await invoke(NATIVE_COMMANDS.retainNodeEditorBase, { holdId, nodeId, versionId });
}

export async function releaseWorkspaceEditorBase(nodeId: string, holdId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('workspace_editor_base_runtime_unavailable');
  await invoke(NATIVE_COMMANDS.releaseNodeEditorBase, { holdId, nodeId });
}
