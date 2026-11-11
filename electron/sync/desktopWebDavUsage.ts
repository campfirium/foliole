import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { WEB_DAV_USAGE_PERIOD_MINUTES, type WebDavUsage, type WebDavUsagePeriod } from '../../lib/platform/webDavRelayContract.js';
import { resolveAppPaths } from '../ipc/paths.js';

const recordSchema = z.object({
  endedAt: z.number().int().nonnegative(),
  uploadedBytes: z.number().int().nonnegative(),
  downloadedBytes: z.number().int().nonnegative()
});
export type WebDavUsageRecord = z.infer<typeof recordSchema>;

const minute = 60_000;

function inWindow(record: WebDavUsageRecord, now: number, period: WebDavUsagePeriod) {
  return record.endedAt > now - WEB_DAV_USAGE_PERIOD_MINUTES[period] * minute && record.endedAt <= now;
}

function usagePath() {
  return path.join(resolveAppPaths().app_config_dir, 'webdav-usage.json');
}

async function readRecords(file: string) {
  try {
    return z.array(recordSchema).parse(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

let pendingWrite = Promise.resolve();

export function recordDesktopWebDavUsage(record: WebDavUsageRecord) {
  const write = pendingWrite.then(async () => {
    const file = usagePath();
    const cutoff = Date.now() - WEB_DAV_USAGE_PERIOD_MINUTES.hour * minute;
    const records = (await readRecords(file)).filter(entry => entry.endedAt > cutoff);
    records.push(record);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
    await fs.rename(temporary, file);
  });
  pendingWrite = write.catch(() => {
    console.warn('[webdav] Could not save local usage.');
  });
  return pendingWrite;
}

function summarize(records: WebDavUsageRecord[], now: number, period: WebDavUsagePeriod) {
  const totals = { requests: 0, uploadedBytes: 0, downloadedBytes: 0 };
  for (const record of records) {
    if (!inWindow(record, now, period)) continue;
    totals.requests++;
    totals.uploadedBytes += record.uploadedBytes;
    totals.downloadedBytes += record.downloadedBytes;
  }
  return totals;
}

export async function loadDesktopWebDavUsage(): Promise<WebDavUsage | null> {
  await pendingWrite;
  try {
    const records = await readRecords(usagePath());
    const measuredAt = Date.now();
    return {
      measuredAt,
      tenMinutes: summarize(records, measuredAt, 'tenMinutes'),
      halfHour: summarize(records, measuredAt, 'halfHour'),
      hour: summarize(records, measuredAt, 'hour')
    };
  } catch {
    return null;
  }
}
