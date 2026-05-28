import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { App } from 'electron';

import type { NativeCopyDiagnosticReportResult } from '../../lib/platform/nativeUtilityContract.js';

interface FileSummary {
  name: string;
  sizeBytes: number;
}

interface ParsedLogRecord {
  event?: string;
  level?: string;
  occurred_at?: string;
  payload?: unknown;
  source?: string;
  stage?: string;
  timestamp?: string;
}

interface FormattedRecord {
  at: string;
  detail?: string;
  file?: string;
  name: string;
  source?: string;
}

const MAX_TAIL_BYTES = 128 * 1024;
const MAX_RECENT_ERRORS = 8;
const MAX_BOOT_EVENTS = 8;
const NOISE_BOOT_STAGES = new Set(['app_responsive', 'desktop_task_progress']);
const SAFE_PAYLOAD_KEYS = ['code', 'message', 'name', 'reason', 'stage', 'status'] as const;

function formatBytes(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${sizeBytes} B`;
}

function normalizeReportPath(rootPath: string, filePath: string) {
  return path.relative(rootPath, filePath).split(path.sep).join('/');
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTail(filePath: string, maxBytes = MAX_TAIL_BYTES) {
  const stat = await fs.stat(filePath);
  const length = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(length);
  const handle = await fs.open(filePath, 'r');
  try {
    await handle.read(buffer, 0, length, Math.max(0, stat.size - length));
  } finally {
    await handle.close();
  }
  return buffer.toString('utf8');
}

function parseNdjsonTail(text: string): ParsedLogRecord[] {
  return text
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ParsedLogRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is ParsedLogRecord => Boolean(record));
}

async function listFiles(rootPath: string, currentPath = rootPath): Promise<FileSummary[]> {
  if (!(await pathExists(currentPath))) return [];
  const stat = await fs.stat(currentPath);
  if (stat.isFile()) {
    return [{ name: normalizeReportPath(rootPath, currentPath), sizeBytes: stat.size }];
  }
  if (!stat.isDirectory()) return [];
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => listFiles(rootPath, path.join(currentPath, entry.name))));
  return nested.flat();
}

async function collectRecentRuntimeErrors(logsDir: string) {
  const files = (await listFiles(logsDir))
    .filter((file) => /^runtime-\d{4}-\d{2}-\d{2}\.ndjson$/u.test(file.name))
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(0, 3);
  const records = (await Promise.all(files.map(async (file) => {
    const text = await readTail(path.join(logsDir, file.name));
    return parseNdjsonTail(text)
      .filter((record) => record.level === 'error' || record.level === 'warn')
      .map((record) => ({ ...formatRecord(record), file: file.name }));
  }))).flat();
  return records.slice(-MAX_RECENT_ERRORS);
}

async function collectRecentBootEvents(logsDir: string) {
  const bootLogPath = path.join(logsDir, 'windows', 'native-boot-events.ndjson');
  if (!(await pathExists(bootLogPath))) return { events: [], summary: null as FileSummary | null };
  const stat = await fs.stat(bootLogPath);
  const events = parseNdjsonTail(await readTail(bootLogPath))
    .filter((record) => !NOISE_BOOT_STAGES.has(record.stage ?? ''))
    .slice(-MAX_BOOT_EVENTS);
  return {
    events: events.map(formatRecord),
    summary: { name: 'windows/native-boot-events.ndjson', sizeBytes: stat.size }
  };
}

function asSafePayloadDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const safe = Object.fromEntries(
    SAFE_PAYLOAD_KEYS
      .map((key) => [key, (payload as Record<string, unknown>)[key]])
      .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
  );
  const text = JSON.stringify(safe);
  return text === '{}' ? undefined : text.slice(0, 180);
}

function formatRecord(record: ParsedLogRecord): FormattedRecord {
  const detail = asSafePayloadDetail(record.payload);
  return {
    at: record.occurred_at ?? record.timestamp ?? 'unknown time',
    name: record.event ?? record.stage ?? 'unknown',
    ...(detail ? { detail } : {}),
    ...(record.source ? { source: record.source } : {})
  };
}

function formatRecordLine(record: FormattedRecord) {
  const source = record.source ? ` ${record.source}` : '';
  const detail = record.detail ? ` ${record.detail}` : '';
  const file = record.file ? ` [${record.file}]` : '';
  return `- ${record.at}${source}: ${record.name}${detail}${file}`;
}

function formatFileList(files: FileSummary[], emptyText: string) {
  if (files.length === 0) return `- ${emptyText}`;
  return files
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, 8)
    .map((file) => `- ${file.name} (${formatBytes(file.sizeBytes)})`)
    .join('\n');
}

export async function copyDiagnosticReport(args: {
  app: Pick<App, 'getPath' | 'getVersion'>;
}): Promise<NativeCopyDiagnosticReportResult> {
  const logsDir = args.app.getPath('logs');
  const crashDumpsDir = args.app.getPath('crashDumps');
  const [recentErrors, boot, crashFiles, logFiles] = await Promise.all([
    collectRecentRuntimeErrors(logsDir),
    collectRecentBootEvents(logsDir),
    listFiles(crashDumpsDir),
    listFiles(logsDir)
  ]);
  const largeLogs = logFiles.filter((file) => file.sizeBytes >= 1024 * 1024);
  const report = [
    '# Foliole Diagnostic Report',
    '',
    `Created at: ${new Date().toISOString()}`,
    `App version: ${args.app.getVersion()}`,
    `Platform: ${process.platform} ${os.release()}`,
    `Electron: ${process.versions.electron ?? 'unknown'}`,
    '',
    'Privacy:',
    '- This report does not include library content, database files, attachments, cache files, or full logs.',
    '',
    'Recent errors and warnings:',
    recentErrors.length > 0
      ? recentErrors.map(formatRecordLine).join('\n')
      : '- None found in recent runtime log tails.',
    '',
    'Startup summary:',
    boot.summary
      ? `- Startup log available: ${boot.summary.name} (${formatBytes(boot.summary.sizeBytes)})`
      : '- No startup log found.',
    boot.events.length > 0 ? boot.events.map(formatRecordLine).join('\n') : '- No recent startup events found.',
    '',
    'Crash reports:',
    formatFileList(crashFiles, 'No crash dump files found.'),
    '',
    'Large logs excluded:',
    formatFileList(largeLogs, 'No large log files found.')
  ].join('\n');
  return {
    report_text: report,
    status: 'generated'
  };
}
