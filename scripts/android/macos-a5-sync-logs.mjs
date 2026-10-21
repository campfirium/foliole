import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

const SYNC_PREFIX = '[FolioleSync] ';
const STAGES = new Set(['push', 'structure_page', 'resources',
  'identity_source', 'identity_tombstones', 'identity_index', 'identity_snapshot_copy', 'identity_facts', 'identity_seal']);
const STATUSES = new Set(['started', 'completed', 'failed']);
const NUMBER_FIELDS = ['page', 'fromCursor', 'toCursor', 'appliedObjects', 'appliedBlobs', 'elapsedMs'];
const HTTP_OPERATIONS = new Set(['inventory', 'pull', 'object', 'pulls', 'objects', 'attachments', 'round_finish']);
const HTTP_PHASES = new Set(['open_output', 'write', 'touch_round', 'flush', 'close_output', 'response_code']);

function parseHttpTiming(line) {
  const match = line.match(/^\s*(\d+\.\d+)\s+(\d+)\s+\d+\s+D\s+FolioleSyncHttp\s*:\s+(.*)$/u);
  if (!match) return null;
  const fields = Object.fromEntries([...match[3].matchAll(/(\w+)=([^\s]+)/gu)]
    .map((entry) => [entry[1], entry[2]]));
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(fields.request_id ?? '')
    || !HTTP_OPERATIONS.has(fields.operation) || !HTTP_PHASES.has(fields.phase)) return null;
  try {
    const origin = new URL(fields.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== fields.origin) return null;
    const elapsedMs = Number(fields.duration_ms);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
    const row = { at: new Date(Number(match[1]) * 1000).toISOString(), pid: Number(match[2]),
      requestId: fields.request_id, origin: origin.origin, operation: fields.operation,
      phase: fields.phase, elapsedMs };
    for (const [source, target] of [['request_bytes', 'requestBytes'], ['chunk', 'chunk'], ['bytes', 'bytes']]) {
      const value = Number(fields[source]);
      if (Number.isSafeInteger(value) && value >= 0) row[target] = value;
    }
    return row;
  } catch { return null; }
}

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
  return output.split(/\r?\n/u).map((line) => parseHttpTiming(line) ?? parseSyncLine(line))
    .filter(Boolean).slice(-300);
}

export function readA5SyncLogs({ assertFixed, buildIdentity, captured, paths, serial }) {
  assertFixed();
  const output = captured(paths.adb, [
    '-s', serial, 'logcat', '-d', '-v', 'epoch', '-s', 'Capacitor/Console:I', 'FolioleSyncHttp:D'
  ], { maxBuffer: 8 * 1024 * 1024 });
  const rows = parseA5SyncLogcat(output);
  const directory = path.join(paths.artifactsRoot, 'a5-sync-logs', buildIdentity());
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, 'sync-logs.json');
  fs.writeFileSync(filePath, `${JSON.stringify({ capturedAt: new Date().toISOString(),
    serial, rows }, null, 2)}\n`, 'utf8');
  return { filePath, rows };
}
