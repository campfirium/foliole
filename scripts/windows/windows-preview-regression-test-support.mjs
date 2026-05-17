/* global process */
import { spawn } from 'node:child_process';

const RESTART_INTENT_FILE = '.windows-dev-restart-intent.json';
const RESTART_DELIVERY_FILE = '.windows-dev-restart-delivered.json';
const RENDERER_RELOAD_INTENT_FILE = '.windows-dev-renderer-reload-intent.json';
const RENDERER_RELOAD_DELIVERY_FILE = '.windows-dev-renderer-reload-delivered.json';
const TEST_IDLE_TIMEOUT_MS = 5_000;

export function startIntentConsumer(rootDir, mode, repoRoot) {
  const script = `
const fs = require('node:fs');
const path = require('node:path');
const rootDir = process.argv[1];
const mode = process.argv[2];
const intentFile = path.join(rootDir, mode === 'restart' ? '${RESTART_INTENT_FILE}' : '${RENDERER_RELOAD_INTENT_FILE}');
const deliveryFile = path.join(rootDir, mode === 'restart' ? '${RESTART_DELIVERY_FILE}' : '${RENDERER_RELOAD_DELIVERY_FILE}');
const bootReadyFile = path.join(rootDir, '.windows-native-boot-ready.json');
const bridgeReadyFile = path.join(rootDir, '.windows-native-bridge-ready.json');
function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > ${TEST_IDLE_TIMEOUT_MS}) {
      clearInterval(timer);
      process.exit(0);
    }
    return;
  }
  const payload = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  fs.unlinkSync(intentFile);
  writeJson(deliveryFile, {
    deliveredAt: new Date().toISOString(),
    head: payload.head ?? null,
    kind: mode === 'restart' ? 'foliole.electron.dev.restart-delivered.v1' : 'foliole.electron.dev.renderer-reload-delivered.v1',
    nonce: payload.nonce,
    reason: payload.reason,
    requestedAt: payload.requestedAt,
    requestedBy: payload.requestedBy,
    target: payload.target
  });
  if (mode === 'restart' || mode === 'renderer-reload') {
    writeJson(bootReadyFile, {
      head: payload.head ?? null,
      pid: 501,
      session: 'session-1',
      stage: 'app_ready',
      timestamp: new Date(Date.parse(payload.requestedAt) + 1000).toISOString()
    });
    writeJson(bridgeReadyFile, {
      head: payload.head ?? null,
      pid: 501,
      session: 'session-1',
      stage: 'bridge_ready',
      timestamp: new Date(Date.parse(payload.requestedAt) + 2000).toISOString(),
      payload: { bridgeAvailable: true }
    });
  }
  clearInterval(timer);
  process.exit(0);
}, 50);
`;

  return spawn(process.execPath, ['-e', script, rootDir, mode], {
    cwd: repoRoot,
    stdio: 'ignore'
  });
}
