import { canRecordNativeCommandArgs } from '../../../lib/platform/nativeCommandPrivacy';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import { recordDesktopDebugInvoke, recordDesktopDebugInvokeFailure } from './desktopDebugProbe';
import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';

export type RuntimeInvoke = NativeInvoke;

const WORKSPACE_WRITE_COMMANDS = new Set<string>([
  NATIVE_COMMANDS.applyReviewGrade,
  NATIVE_COMMANDS.createFolder,
  NATIVE_COMMANDS.createItem,
  NATIVE_COMMANDS.createPdfImageExcerpt,
  NATIVE_COMMANDS.createTopic,
  NATIVE_COMMANDS.deleteNodesPermanently,
  NATIVE_COMMANDS.flushDirtyNodeSyncVersions,
  NATIVE_COMMANDS.moveNodes,
  NATIVE_COMMANDS.relearnNode,
  NATIVE_COMMANDS.replaceNodeOrder,
  NATIVE_COMMANDS.restoreNodes,
  NATIVE_COMMANDS.saveEditorOperationHistory,
  NATIVE_COMMANDS.saveNodeOpenState,
  NATIVE_COMMANDS.saveNodeReadingState,
  NATIVE_COMMANDS.saveNodeReviewState,
  NATIVE_COMMANDS.saveReadingProgress,
  NATIVE_COMMANDS.softDeleteNodes,
  NATIVE_COMMANDS.splitTopic,
  NATIVE_COMMANDS.updateNodeContent,
  NATIVE_COMMANDS.updateNodeContentWithAnchors,
  NATIVE_COMMANDS.updateNodeReveal
]);

let workspaceWritesFrozen = false;
const inFlightWorkspaceWrites = new Set<Promise<unknown>>();

export function runWithWorkspaceRuntimeWriteGate<T>(command: string, invoke: () => Promise<T>): Promise<T> {
  if (!WORKSPACE_WRITE_COMMANDS.has(command)) return invoke();
  if (workspaceWritesFrozen) {
    return Promise.reject(new Error('workspace writes are frozen for backup restore'));
  }
  const request = invoke();
  inFlightWorkspaceWrites.add(request);
  void request.finally(() => inFlightWorkspaceWrites.delete(request)).catch(() => undefined);
  return request;
}

export function freezeWorkspaceRuntimeWrites() {
  if (workspaceWritesFrozen) return false;
  workspaceWritesFrozen = true;
  return true;
}

export function unfreezeWorkspaceRuntimeWrites() {
  workspaceWritesFrozen = false;
}

export async function waitForWorkspaceRuntimeWrites() {
  while (inFlightWorkspaceWrites.size > 0) {
    await Promise.allSettled([...inFlightWorkspaceWrites]);
  }
}

export function resetWorkspaceRuntimeWriteGateForTests() {
  workspaceWritesFrozen = false;
  inFlightWorkspaceWrites.clear();
}

export function getRuntimeInvoke(): RuntimeInvoke | null {
  if (!isDesktopRuntime()) {
    return null;
  }

  const runtimeInvoke = getElectronAPI()?.invoke;
  if (!runtimeInvoke) {
    return null;
  }

  return ((command: string, args?: Record<string, unknown>) => {
    const startedAt = Date.now();
    const request = runWithWorkspaceRuntimeWriteGate(command, () =>
      Promise.resolve(args === undefined ? runtimeInvoke(command) : runtimeInvoke(command, args))
    );
    return Promise.resolve(request)
      .then((result) => {
        recordDesktopDebugInvoke({
          command,
          args,
          durationMs: Date.now() - startedAt,
          status: 'resolved'
        });
        return result;
      })
      .catch((error) => {
        const debugArgs = canRecordNativeCommandArgs(command) ? args : undefined;
        recordDesktopDebugInvoke({
          command,
          args: debugArgs,
          durationMs: Date.now() - startedAt,
          error,
          status: 'rejected'
        });
        recordDesktopDebugInvokeFailure({ command, args: debugArgs, error });
        throw error;
      });
  }) as RuntimeInvoke;
}

export function isRuntimeInvokeAvailable() {
  return Boolean(getRuntimeInvoke());
}
