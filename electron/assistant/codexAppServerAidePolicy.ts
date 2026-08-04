import { createFolioleDynamicTools } from './codexAppServerDynamicTools.js';

export function createAideThreadStartParams(
  cwd: string,
  developerInstructions: string,
  capabilities: readonly string[] = []
) {
  return {
    approvalPolicy: 'never',
    cwd,
    developerInstructions,
    dynamicTools: createFolioleDynamicTools(capabilities),
    sandbox: 'read-only'
  };
}

export function createAideThreadRequest(
  id: number,
  cwd: string,
  developerInstructions: string,
  providerThreadId?: string,
  capabilities: readonly string[] = []
) {
  return providerThreadId
    ? {
        id,
        method: 'thread/resume',
        params: { cwd, developerInstructions, threadId: providerThreadId }
      }
    : {
        id,
        method: 'thread/start',
        params: createAideThreadStartParams(cwd, developerInstructions, capabilities)
      };
}

export function createAideSkillsRootsRequest(id: number, skillRoots: readonly string[]) {
  return {
    id,
    method: 'skills/extraRoots/set',
    params: { extraRoots: [...skillRoots] }
  };
}

export function createAideTurnStartParams(
  cwd: string,
  threadId: string,
  userMessage: string,
  imagePaths: readonly string[] = [],
  modelSelection?: import('../../lib/platform/nativeAssistantModelContract.js').NativeAssistantModelSelection
) {
  return {
    approvalPolicy: 'never',
    cwd,
    input: [
      { text: userMessage, type: 'text' },
      ...imagePaths.map((imagePath) => ({ path: imagePath, type: 'localImage' }))
    ],
    ...(modelSelection ? {
      effort: modelSelection.effort,
      model: modelSelection.model,
      serviceTier: modelSelection.serviceTier
    } : {}),
    sandboxPolicy: {
      networkAccess: 'restricted',
      type: 'externalSandbox'
    },
    threadId
  };
}
