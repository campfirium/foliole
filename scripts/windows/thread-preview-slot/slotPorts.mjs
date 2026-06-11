import net from 'node:net';
import { spawnSync } from 'node:child_process';

import { paths, readJson, writeJson } from './slotCommon.mjs';

const PORT_START = 24600;
const PORT_END = 24649;

function registryPath() {
  return paths('registry').portRegistryFile;
}

function readRegistry() {
  return readJson(registryPath(), { ports: {} });
}

function writeRegistry(registry) {
  writeJson(registryPath(), registry);
}

export function isPortAvailable(port, host = '127.0.0.1') {
  const windowsAvailable = isWindowsPortAvailable(port, host);
  if (windowsAvailable !== null) {
    return Promise.resolve(windowsAvailable);
  }
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function isWindowsPortAvailable(port, host) {
  if (process.env.FOLIOLE_PREVIEW_SLOT_SKIP_WINDOWS_PORT_CHECK === '1') return null;
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `if (Test-NetConnection -ComputerName '${host}' -Port ${port} -InformationLevel Quiet) { 'BUSY' } else { 'FREE' }`
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 8000
  });
  if (result.status !== 0) return null;
  const output = result.stdout.trim();
  if (output === 'BUSY') return false;
  if (output === 'FREE') return true;
  return null;
}

function usedPorts(registry) {
  return new Set(Object.values(registry.ports ?? {}).map((entry) => entry?.port).filter(Number.isInteger));
}

export async function acquireSlotPort(slot, { label = '', thread = '' } = {}) {
  const registry = readRegistry();
  registry.ports = registry.ports && typeof registry.ports === 'object' ? registry.ports : {};
  if (registry.ports[slot]?.port) {
    return registry.ports[slot].port;
  }
  const used = usedPorts(registry);
  for (let port = PORT_START; port <= PORT_END; port += 1) {
    if (used.has(port)) continue;
    if (!(await isPortAvailable(port))) continue;
    registry.ports[slot] = {
      label,
      port,
      slot,
      thread,
      updatedAt: new Date().toISOString()
    };
    writeRegistry(registry);
    return port;
  }
  throw new Error(`no available preview slot port in ${PORT_START}-${PORT_END}`);
}

export function releaseSlotPort(slot) {
  const registry = readRegistry();
  if (registry.ports?.[slot]) {
    delete registry.ports[slot];
    writeRegistry(registry);
  }
}

export function readSlotPort(slot) {
  return readRegistry().ports?.[slot]?.port ?? null;
}
