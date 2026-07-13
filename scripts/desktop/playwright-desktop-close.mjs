import { killPid } from '../lib/process-control.mjs';

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function closeDesktopApplication(electronApp, { gracefulTimeoutMs = 5000 } = {}) {
  let pid;
  try {
    pid = electronApp.process()?.pid;
  } catch {
    return;
  }
  const closePromise = electronApp.close();
  const closedGracefully = await Promise.race([
    closePromise.then(() => true),
    delay(gracefulTimeoutMs).then(() => false)
  ]);
  if (closedGracefully || !pid) return;
  await killPid(pid, { timeoutMs: 3000 });
  await Promise.race([closePromise, delay(1000)]);
}
