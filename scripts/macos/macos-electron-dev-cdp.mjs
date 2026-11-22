/* global AbortSignal, clearTimeout, fetch, setTimeout, WebSocket */

const CDP_HOST = '127.0.0.1';

async function readCdpVersion(port, fetchImpl, timeoutMs) {
  const response = await fetchImpl(`http://${CDP_HOST}:${port}/json/version`, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const version = await response.json();
  if (typeof version?.webSocketDebuggerUrl !== 'string') throw new Error('no browser websocket');
  return version;
}

export function requestCdpBrowserProcessInfo(webSocketUrl, {
  createSocket = (url) => new WebSocket(url),
  timeoutMs = 5000
} = {}) {
  return new Promise((resolve, reject) => {
    const socket = createSocket(webSocketUrl);
    const timer = setTimeout(() => finish(new Error('SystemInfo.getProcessInfo timed out')), timeoutMs);
    let settled = false;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error);
      else resolve(value);
    }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' }));
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message?.id !== 1) return;
      if (message.error) finish(new Error(`SystemInfo.getProcessInfo failed: ${message.error.message ?? 'unknown'}`));
      else finish(null, message.result?.processInfo ?? []);
    });
    socket.addEventListener('error', () => finish(new Error('browser websocket error')));
    socket.addEventListener('close', () => finish(new Error('browser websocket closed before reply')));
  });
}

export function findCdpBrowserPid(processInfo) {
  const browser = Array.isArray(processInfo) ? processInfo.find((entry) => entry?.type === 'browser') : null;
  return Number.isInteger(browser?.id) ? browser.id : null;
}

/**
 * Confirms the CDP endpoint on `port` belongs to the Electron runtime this launch started.
 * A stale Electron already listening on the port makes the new runtime's bind() fail
 * silently, so a reachable endpoint alone proves nothing.
 */
export async function verifyMacosElectronDevCdpOwnership({
  attempts = 10,
  fetchImpl = fetch,
  port,
  requestProcessInfo = requestCdpBrowserProcessInfo,
  retryDelayMs = 300,
  runtimePid,
  timeoutMs = 3000
}) {
  let version = null;
  let lastError = null;
  for (let attempt = 0; attempt < attempts && !version; attempt += 1) {
    try {
      version = await readCdpVersion(port, fetchImpl, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  if (!version) {
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`CDP port ${port} is not reachable for runtime pid=${runtimePid}: ${reason}`);
  }
  const processInfo = await requestProcessInfo(version.webSocketDebuggerUrl, { timeoutMs });
  const browserPid = findCdpBrowserPid(processInfo);
  if (browserPid === null) {
    throw new Error(`CDP port ${port} did not report a browser process; cannot confirm it belongs to runtime pid=${runtimePid}`);
  }
  if (browserPid !== runtimePid) {
    throw new Error(
      `CDP port ${port} already in use by another process (browser pid=${browserPid}, runtime pid=${runtimePid}); ` +
      'stop that instance or choose another --remote-debugging-port'
    );
  }
  return { browserPid, port };
}
