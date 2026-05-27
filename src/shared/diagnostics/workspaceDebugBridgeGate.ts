export function isWorkspaceDebugEnabledForRuntime(args: {
  isDev: boolean;
  isTest: boolean;
  workspaceDebugBridge?: boolean | undefined;
}) {
  if (args.isDev || args.isTest) {
    return true;
  }
  return args.workspaceDebugBridge === true;
}
