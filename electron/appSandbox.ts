export function isRunningInAppSandbox(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.APP_SANDBOX_CONTAINER_ID);
}
