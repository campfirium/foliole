/* global process */

const VITE_HOST = '127.0.0.1';
const VITE_PORT_DEFAULT = 24600;
const VITE_PORT_MAX_ATTEMPTS = 8;

export function resolveRequestedPort(env = process.env) {
  const raw = env.FOLIOLE_VITE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return VITE_PORT_DEFAULT;
}

export function resolveViteUrl(port) {
  return `http://${VITE_HOST}:${port}`;
}

export function isStrictVitePort(env = process.env) {
  return env.FOLIOLE_VITE_PORT_STRICT === '1';
}

export function candidateVitePorts(preferredPort, env = process.env) {
  if (isStrictVitePort(env)) return [preferredPort];
  const ports = new Set([preferredPort]);
  for (let offset = 0; offset < VITE_PORT_MAX_ATTEMPTS; offset += 1) {
    ports.add(preferredPort + 100 + offset);
    ports.add(5173 + offset);
    ports.add(3000 + offset);
  }
  return [...ports];
}
