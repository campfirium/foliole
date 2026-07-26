import { closeOwnedDesktopLaunch } from './playwright-desktop-ownership.mjs';

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function closeDesktopApplication(electronApp, {
  gracefulTimeoutMs = 5000,
  ownership,
  ownershipCloseOptions
} = {}) {
  let pid;
  try {
    pid = electronApp.process()?.pid;
  } catch {
    return { confirmedExited: true, reason: 'already-closed' };
  }
  const closePromise = electronApp.close();
  const closedGracefully = await Promise.race([
    closePromise.then(() => true),
    delay(gracefulTimeoutMs).then(() => false)
  ]);
  if (closedGracefully || !pid) {
    if (!ownership?.managed) return { confirmedExited: true, reason: 'graceful' };
    return closeOwnedDesktopLaunch(ownership, ownershipCloseOptions);
  }
  return closeOwnedDesktopLaunch(ownership, ownershipCloseOptions);
}
