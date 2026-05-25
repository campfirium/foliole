export function isWorkspaceDebugEnabledForRuntime(args: {
  isDev: boolean;
  isTest: boolean;
  workspaceDebugBridge?: boolean;
}) {
  if (args.isDev || args.isTest) {
    return true;
  }
  return args.workspaceDebugBridge === true;
}
