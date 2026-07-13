export function createAideThreadStartParams(cwd: string) {
  return {
    approvalPolicy: 'never',
    cwd,
    sandbox: 'workspace-write'
  };
}

export function createAideThreadRequest(id: number, cwd: string, providerThreadId?: string) {
  return providerThreadId
    ? { id, method: 'thread/resume', params: { threadId: providerThreadId } }
    : { id, method: 'thread/start', params: createAideThreadStartParams(cwd) };
}

export function createAideTurnStartParams(cwd: string, threadId: string, userMessage: string) {
  return {
    approvalPolicy: 'never',
    cwd,
    input: [{ text: userMessage, type: 'text' }],
    sandboxPolicy: {
      excludeSlashTmp: true,
      excludeTmpdirEnvVar: true,
      networkAccess: true,
      type: 'workspaceWrite',
      writableRoots: [cwd]
    },
    threadId
  };
}
