import { promises as fs } from 'node:fs';
import path from 'node:path';

import { asString, asTimestamp } from '../ipc/commandParsers.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { isDesktopDebugProbeEnabled } from './desktopDebugTrace.js';
import { recordDesktopSupportEvent } from './desktopSupportLog.js';
import { redactDiagnosticPayload } from './diagnosticRedactor.js';

const DEFAULT_RETENTION_DAYS = 7;
const MAX_DAILY_LOG_BYTES = 1024 * 1024;
const LOG_PREFIX = 'runtime-';
const LOG_SUFFIX = '.ndjson';

type DiagnosticLogLevel = 'warn' | 'error' | 'info' | 'debug';

interface DiagnosticLogRecord {
  event: string;
  level: DiagnosticLogLevel;
  occurred_at: string;
  payload: Record<string, unknown>;
  source: string;
}

let writeTail: Promise<void> = Promise.resolve();

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveDiagnosticLogDir() {
  return resolveAppPaths().app_log_dir;
}

function isDiagnosticLogLevel(value: unknown): value is DiagnosticLogLevel {
  return value === 'warn' || value === 'error' || value === 'info' || value === 'debug';
}

function isExpiredLogFile(fileName: string, cutoffDateKey: string) {
  if (!fileName.startsWith(LOG_PREFIX) || !fileName.endsWith(LOG_SUFFIX)) {
    return false;
  }
  const dateKey = fileName.slice(LOG_PREFIX.length, -LOG_SUFFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < cutoffDateKey;
}

async function pruneExpiredLogs(logDir: string, retentionDays: number, now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
  const cutoffDateKey = formatDateKey(cutoff);
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isExpiredLogFile(entry.name, cutoffDateKey))
      .map((entry) => fs.rm(path.join(logDir, entry.name), { force: true }))
  );
}

function shouldPersistRuntimeLog(record: DiagnosticLogRecord) {
  return record.level === 'error' || record.level === 'warn' || isDesktopDebugProbeEnabled()
    || (record.source === 'electron.agentControl' && record.event === 'agent_control_api_call');
}

async function getRuntimeLogSize(filePath: string) {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile()) throw new Error('Invalid runtime diagnostic log file');
    return stat.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function readRuntimeLogTail(filePath: string, size: number, budget: number) {
  if (budget === 0) return Buffer.alloc(0);
  const offset = Math.max(0, size - budget - 1);
  const tail = Buffer.alloc(size - offset);
  const handle = await fs.open(filePath, 'r');
  try {
    const { bytesRead } = await handle.read(tail, 0, tail.length, offset);
    if (bytesRead !== tail.length) throw new Error('Could not read the complete runtime log tail');
  } finally {
    await handle.close();
  }
  const first = size > budget ? tail.indexOf(0x0a) : -1;
  return tail.subarray(first + 1, tail.lastIndexOf(0x0a) + 1);
}

async function writeRuntimeLogLine(filePath: string, line: Buffer) {
  if (line.length > MAX_DAILY_LOG_BYTES) return;
  const size = await getRuntimeLogSize(filePath);
  if (size + line.length <= MAX_DAILY_LOG_BYTES) {
    await fs.appendFile(filePath, line, { mode: 0o600 });
    return;
  }

  const budget = Math.min(MAX_DAILY_LOG_BYTES / 2, MAX_DAILY_LOG_BYTES - line.length);
  const recent = await readRuntimeLogTail(filePath, size, budget);
  const pendingPath = `${filePath}.tmp`;
  await fs.rm(pendingPath, { force: true });
  try {
    await fs.writeFile(pendingPath, Buffer.concat([recent, line]), { flag: 'wx', mode: 0o600 });
    await fs.rename(pendingPath, filePath);
  } finally {
    await fs.rm(pendingPath, { force: true });
  }
}

export function parseDiagnosticLogPayload(value: unknown): DiagnosticLogRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid argument: diagnostic_log_payload');
  }
  const payload = value as Record<string, unknown>;
  if (!isDiagnosticLogLevel(payload.level)) {
    throw new Error('invalid argument: diagnostic_log_payload.level');
  }
  return {
    event: asString(payload.event, 'diagnostic_log_payload.event'),
    level: payload.level,
    occurred_at: payload.occurredAt
      ? asTimestamp(payload.occurredAt, 'diagnostic_log_payload.occurredAt')
      : new Date().toISOString(),
    payload: redactDiagnosticPayload(payload.payload),
    source: asString(payload.source, 'diagnostic_log_payload.source')
  };
}

export async function appendDiagnosticLog(
  input: DiagnosticLogRecord,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  const record = {
    ...input,
    payload: redactDiagnosticPayload(input.payload)
  };
  await recordDesktopSupportEvent(record).catch(error => {
    console.error('[support-log] Could not record event', error);
  });
  if (!shouldPersistRuntimeLog(record)) return;
  const logDir = resolveDiagnosticLogDir();
  const filePath = path.join(logDir, `${LOG_PREFIX}${formatDateKey(now)}${LOG_SUFFIX}`);
  const write = writeTail.then(async () => {
    await fs.mkdir(logDir, { recursive: true });
    await pruneExpiredLogs(logDir, retentionDays, now);
    await writeRuntimeLogLine(filePath, Buffer.from(`${JSON.stringify(record)}\n`));
  });
  writeTail = write.catch(() => undefined);
  await write;
}
