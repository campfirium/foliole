import { promises as fs } from 'node:fs';
import path from 'node:path';

import { asString, asTimestamp } from '../ipc/commandParsers.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { appendBoundedLogLine, boundExistingLogFile } from './boundedLogLine.js';
import { isDesktopDebugProbeEnabled } from './desktopDebugTrace.js';
import { recordDesktopSupportEvent } from './desktopSupportLog.js';
import { redactDiagnosticPayload } from './diagnosticRedactor.js';

const DEFAULT_RETENTION_DAYS = 7;
const MAX_DAILY_LOG_BYTES = 1024 * 1024;
const LOG_PREFIX = 'runtime-';
const LOG_SUFFIX = '.ndjson';
const RUNTIME_LOG_NAME = /^runtime-\d{4}-\d{2}-\d{2}\.ndjson$/u;

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

function dailyLogName(date: Date) {
  return `${LOG_PREFIX}${formatDateKey(date)}${LOG_SUFFIX}`;
}

async function pruneExpiredLogs(logDir: string, retentionDays: number, now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
  const cutoffName = dailyLogName(cutoff);
  const today = dailyLogName(now);
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && RUNTIME_LOG_NAME.test(entry.name)).map(entry => entry.name);
  const recent = names.filter(name => name >= cutoffName && name !== today).sort().reverse();
  const keep = new Set([today, ...recent.slice(0, retentionDays - 1)]);
  await Promise.all(names.filter(name => !keep.has(name)).map(name => fs.rm(path.join(logDir, name), { force: true })));
  return names.filter(name => keep.has(name));
}

function queueDiagnosticWrite(task: () => Promise<void>) {
  const write = writeTail.then(task);
  writeTail = write.catch(() => undefined);
  return write;
}

export async function maintainRuntimeDiagnosticLogs(logDir: string) {
  await queueDiagnosticWrite(async () => {
    await fs.mkdir(logDir, { recursive: true });
    const recent = await pruneExpiredLogs(logDir, DEFAULT_RETENTION_DAYS, new Date());
    for (const name of recent) await boundExistingLogFile(path.join(logDir, name), MAX_DAILY_LOG_BYTES);
  });
}

function shouldPersistRuntimeLog(record: DiagnosticLogRecord) {
  return record.level === 'error' || record.level === 'warn' || isDesktopDebugProbeEnabled()
    || (record.source === 'electron.agentControl' && record.event === 'agent_control_api_call');
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
  const filePath = path.join(logDir, dailyLogName(now));
  await queueDiagnosticWrite(async () => {
    await fs.mkdir(logDir, { recursive: true });
    await pruneExpiredLogs(logDir, retentionDays, now);
    await appendBoundedLogLine(filePath, Buffer.from(`${JSON.stringify(record)}\n`), MAX_DAILY_LOG_BYTES);
  });
}
