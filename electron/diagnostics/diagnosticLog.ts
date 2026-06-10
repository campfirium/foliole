import { promises as fs } from 'node:fs';
import path from 'node:path';

import { asString, asTimestamp } from '../ipc/commandParsers.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { redactDiagnosticPayload } from './diagnosticRedactor.js';

const DEFAULT_RETENTION_DAYS = 7;
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

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveDiagnosticLogDir() {
  return resolveAppPaths().app_log_dir;
}

function resolveDiagnosticLogPath(dateKey: string) {
  return path.join(resolveDiagnosticLogDir(), `${LOG_PREFIX}${dateKey}${LOG_SUFFIX}`);
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
  now = new Date(input.occurred_at),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  const record = {
    ...input,
    payload: redactDiagnosticPayload(input.payload)
  };
  const logDir = resolveDiagnosticLogDir();
  await fs.mkdir(logDir, { recursive: true });
  await pruneExpiredLogs(logDir, retentionDays, now);
  await fs.appendFile(resolveDiagnosticLogPath(formatDateKey(now)), `${JSON.stringify(record)}\n`, 'utf8');
}
