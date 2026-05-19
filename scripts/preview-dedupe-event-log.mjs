import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export function previewEventLogPath(runtimeDir, target) {
  return path.join(runtimeDir, `${target}-preview.events.jsonl`);
}

function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function localTime(date) {
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

async function resetStaleDailyLog(logPath, now) {
  try {
    const stats = await stat(logPath);
    if (localDayKey(stats.mtime) !== localDayKey(now)) {
      await writeFile(logPath, '', 'utf8');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function appendPreviewEvent({ event, fields = {}, runtimeDir, target }) {
  if (process.env.PREVIEW_DEDUPE_EVENT_LOG === '0') {
    return;
  }
  await mkdir(runtimeDir, { recursive: true });
  const now = new Date();
  const logPath = previewEventLogPath(runtimeDir, target);
  await resetStaleDailyLog(logPath, now);
  const entry = {
    event,
    pid: process.pid,
    target,
    time: localTime(now),
    ...fields
  };
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}
