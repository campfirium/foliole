export function createAideThreadStartParams(cwd: string) {
  return {
    approvalPolicy: 'never',
    cwd,
    sandbox: 'workspaceWrite'
  };
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
