/**
 * Build child-process env for launching Electron runtime.
 * `ELECTRON_RUN_AS_NODE` must be absent, otherwise Electron app APIs are unavailable.
 */
export function createElectronLaunchEnv(baseEnv, rendererUrl) {
  const nextEnv = {
    ...baseEnv,
    ELECTRON_RENDERER_URL: rendererUrl
  };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  return nextEnv;
}
