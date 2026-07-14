/* global console, process */

function stopChild(child, signal) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }
}

export function createElectronDevChildLifecycle({
  consumeRestartRequest,
  electron: initialElectron,
  launchElectron,
  logChildLifecycle,
  stopSignal = 'SIGTERM',
  vite
}) {
  let electron = initialElectron;
  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.exitCode = exitCode;
    if (vite) stopChild(vite, 'SIGTERM');
    stopChild(electron, stopSignal);
  };

  const attachElectronExitHandler = (child) => {
    child.on('exit', (code) => {
      if (shuttingDown) return;
      const request = consumeRestartRequest();
      if (request) {
        console.info(`[electron-dev] dev shell restart requested reason=${request.reason ?? 'unknown'}`);
        if (request.shellAction === 'exit-shell') {
          shutdown(code ?? 0);
          return;
        }
        electron = launchElectron();
        logChildLifecycle(electron, 'electron');
        attachElectronExitHandler(electron);
        return;
      }
      shutdown(code ?? 0);
    });
  };

  attachElectronExitHandler(electron);
  vite?.on('exit', (code) => shutdown(code ?? 0));
  return {
    restartRuntime() {
      if (!shuttingDown) stopChild(electron, stopSignal);
    },
    shutdown
  };
}
