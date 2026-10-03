import fs from 'node:fs';
import path from 'node:path';

const SYNC_PREFIX = '[FolioleSync] ';
const STAGES = new Set(['push', 'structure_page', 'resources']);
const STATUSES = new Set(['started', 'completed', 'failed']);
const NUMBER_FIELDS = ['page', 'fromCursor', 'toCursor', 'appliedObjects', 'appliedBlobs', 'elapsedMs'];

function parseSyncLine(line) {
  const offset = line.indexOf(SYNC_PREFIX);
  if (offset < 0) return null;
  try {
    const parsed = JSON.parse(line.slice(offset + SYNC_PREFIX.length));
    if (!/^[A-Za-z0-9_-]{1,100}$/u.test(parsed.runId)
      || !STAGES.has(parsed.stage) || !STATUSES.has(parsed.status)) return null;
    const seconds = Number.parseFloat(line);
    if (!Number.isFinite(seconds)) return null;
    const row = { at: new Date(seconds * 1000).toISOString(),
      runId: parsed.runId, stage: parsed.stage, status: parsed.status };
    for (const field of NUMBER_FIELDS) {
      if (typeof parsed[field] === 'number' && Number.isFinite(parsed[field]) && parsed[field] >= 0) {
        row[field] = parsed[field];
      }
    }
    return row;
  } catch {
    return null;
  }
}

export function parseA5SyncLogcat(output) {
  return output.split(/\r?\n/u).map(parseSyncLine).filter(Boolean).slice(-300);
}

export function readA5SyncLogs({ assertFixed, buildIdentity, captured, paths, serial }) {
  assertFixed();
  const output = captured(paths.adb, [
    '-s', serial, 'logcat', '-d', '-v', 'epoch', '-s', 'Capacitor/Console:I'
  ], { maxBuffer: 8 * 1024 * 1024 });
  const rows = parseA5SyncLogcat(output);
  const directory = path.join(paths.artifactsRoot, 'a5-sync-logs', buildIdentity());
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, 'sync-logs.json');
  fs.writeFileSync(filePath, `${JSON.stringify({ capturedAt: new Date().toISOString(),
    serial, rows }, null, 2)}\n`, 'utf8');
  return { filePath, rows };
}
