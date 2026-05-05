import { promises as fs } from 'node:fs';
import path from 'node:path';

const BOOT_EVENT_LOG = path.join('logs', 'windows', 'native-boot-events.ndjson');
const READY_MARKER_FILE = '.windows-native-boot-ready.json';

function resolveRepoRoot() {
  const envRoot = process.env.FOLIOLE_WORKDIR;
  if (envRoot) {
    return envRoot;
  }
  return process.cwd();
}

async function appendJsonLine(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function writeJson(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function bootReport(stage: string, payload: unknown = null) {
  const repoRoot = resolveRepoRoot();
  const eventLogPath = path.join(repoRoot, BOOT_EVENT_LOG);
  const readyMarkerPath = path.join(repoRoot, READY_MARKER_FILE);

  const event = {
    timestamp: new Date().toISOString(),
    stage,
    pid: process.pid,
    session: process.env.FOLIOLE_BOOT_SESSION ?? null,
    payload
  };

  await appendJsonLine(eventLogPath, event);
  if (stage === 'app_ready') {
    await writeJson(readyMarkerPath, event);
  }
}
