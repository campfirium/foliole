import { createFolioleDynamicTools } from './codexAppServerDynamicTools.js';

export function createAideThreadStartParams(cwd: string, capabilities: readonly string[] = []) {
  return {
    approvalPolicy: 'never',
    cwd,
    dynamicTools: createFolioleDynamicTools(capabilities),
    sandbox: 'read-only'
  };
}

export function createAideThreadRequest(
  id: number,
  cwd: string,
  providerThreadId?: string,
  capabilities: readonly string[] = []
) {
  return providerThreadId
    ? { id, method: 'thread/resume', params: { threadId: providerThreadId } }
    : { id, method: 'thread/start', params: createAideThreadStartParams(cwd, capabilities) };
}

export function createAideTurnStartParams(cwd: string, threadId: string, userMessage: string) {
  return {
    approvalPolicy: 'never',
    cwd,
    input: [{ text: userMessage, type: 'text' }],
    sandboxPolicy: {
      networkAccess: 'restricted',
      type: 'externalSandbox'
    },
    threadId
  };
}
