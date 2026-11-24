import { appendDiagnosticLog } from './diagnosticLog.js';

/**
 * Always-on timing of every native command at the IPC boundary. A single slow command is logged at once; per hour it
 * also keeps calls and total time per command, so a cheap command called thousands of times (CPU without visible lag)
 * leaves a record too. Only fixed command names and numbers are kept: no arguments, ids, titles or paths.
 * Durations are wall time from IPC entry to result and include waits for the database or the write queue.
 */
export const NATIVE_COMMAND_SLOW_MS = 500;
export const NATIVE_COMMAND_HOT_CALLS_PER_HOUR = 1800;
export const NATIVE_COMMAND_HOT_TOTAL_MS_PER_HOUR = 60_000;

const HOUR_MS = 3_600_000;
const HOURS_KEPT = 24;
const MAX_COMMANDS_PER_HOUR = 300;
const MAX_COMMAND_NAME_LENGTH = 80;
const SLOW_REPEAT_WINDOW_MS = 60_000;
const MAX_TRACKED_SLOW_COMMANDS = 200;

/** Optional wait phases of one command, in ms; absent when the command did not pass that stage. */
export type NativeCommandWaits = { connectionMs?: number; databaseReadyMs?: number };
export type NativeCommandStat = { calls: number; failures: number; totalMs: number; maxMs: number };
type HourBucket = { hourStart: number; commands: Map<string, NativeCommandStat>; reported: boolean };
export type NativeCommandLoadHour = { hourStart: string; calls: number; totalMs: number;
  top: Array<NativeCommandStat & { command: string }> };

const buckets: HourBucket[] = [];
const slowLoggedAt = new Map<string, number>();

function commandName(command: string) {
  return command.length > MAX_COMMAND_NAME_LENGTH ? command.slice(0, MAX_COMMAND_NAME_LENGTH) : command;
}

function currentBucket(now: number) {
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const last = buckets.at(-1);
  if (last?.hourStart === hourStart) return last;
  // A new hour closes the earlier ones; hot commands are reported once per closed hour, so no timer is needed.
  for (const bucket of buckets) if (!bucket.reported) reportHotCommands(bucket);
  const bucket: HourBucket = { hourStart, commands: new Map(), reported: false };
  buckets.push(bucket);
  if (buckets.length > HOURS_KEPT) buckets.shift();
  return bucket;
}

/** Called once per native command when its result or error is ready. Never throws and never awaits the log. */
export function recordNativeCommandTiming(command: string, durationMs: number, status: 'done' | 'failed',
  now = Date.now(), waits: NativeCommandWaits = {}) {
  const name = commandName(command);
  const ms = Math.max(0, Math.round(durationMs));
  const bucket = currentBucket(now);
  let stat = bucket.commands.get(name);
  if (!stat) {
    if (bucket.commands.size >= MAX_COMMANDS_PER_HOUR) return;
    stat = { calls: 0, failures: 0, totalMs: 0, maxMs: 0 };
    bucket.commands.set(name, stat);
  }
  stat.calls += 1;
  if (status === 'failed') stat.failures += 1;
  stat.totalMs += ms;
  stat.maxMs = Math.max(stat.maxMs, ms);
  if (ms >= NATIVE_COMMAND_SLOW_MS && shouldLogSlow(name, now)) {
    void appendDiagnosticLog({ event: 'native_command_slow', level: 'info', occurred_at: new Date(now).toISOString(),
      payload: { command: name, durationMs: ms, status,
        ...(waits.databaseReadyMs === undefined ? {} : { databaseReadyMs: Math.round(waits.databaseReadyMs) }),
        ...(waits.connectionMs === undefined ? {} : { connectionWaitMs: Math.round(waits.connectionMs) }) }, source: 'electron.main' }).catch(() => undefined);
  }
}

function shouldLogSlow(command: string, now: number) {
  const previous = slowLoggedAt.get(command);
  if (previous !== undefined && now - previous < SLOW_REPEAT_WINDOW_MS) return false;
  if (slowLoggedAt.size >= MAX_TRACKED_SLOW_COMMANDS) slowLoggedAt.clear();
  slowLoggedAt.set(command, now);
  return true;
}

function isHot(stat: NativeCommandStat) {
  return stat.calls >= NATIVE_COMMAND_HOT_CALLS_PER_HOUR || stat.totalMs >= NATIVE_COMMAND_HOT_TOTAL_MS_PER_HOUR;
}

function reportHotCommands(bucket: HourBucket) {
  bucket.reported = true;
  const hourStart = new Date(bucket.hourStart).toISOString();
  for (const [command, stat] of bucket.commands) {
    if (!isHot(stat)) continue;
    void appendDiagnosticLog({ event: 'native_command_hot', level: 'info', occurred_at: hourStart,
      payload: { command, calls: stat.calls, failures: stat.failures, totalMs: stat.totalMs, maxMs: stat.maxMs },
      source: 'electron.main' }).catch(() => undefined);
  }
}

/** This session's per-hour command load, newest hour first, the most expensive commands of each hour. */
export function readNativeCommandLoad(limitPerHour = 8): NativeCommandLoadHour[] {
  return buckets.slice().reverse().map((bucket) => {
    const rows = [...bucket.commands].map(([command, stat]) => ({ command, ...stat }));
    return {
      hourStart: new Date(bucket.hourStart).toISOString(),
      calls: rows.reduce((sum, row) => sum + row.calls, 0),
      totalMs: rows.reduce((sum, row) => sum + row.totalMs, 0),
      top: rows.sort((left, right) => right.totalMs - left.totalMs || right.calls - left.calls).slice(0, limitPerHour)
    };
  });
}

export function formatNativeCommandLoad(hours = readNativeCommandLoad(), maxHours = 3) {
  if (!hours.length) return '- No native commands timed in this session yet.';
  return hours.slice(0, maxHours).map((hour) => [
    `- ${hour.hourStart}: ${hour.calls} calls, ${hour.totalMs} ms total`,
    ...hour.top.map((row) => `  - ${row.command}: ${row.calls} calls, ${row.totalMs} ms total, max ${row.maxMs} ms`
      + (row.failures ? `, ${row.failures} failed` : '') + (isHot(row) ? ' (hot)' : ''))
  ].join('\n')).join('\n');
}

export function resetNativeCommandLoadForTests() {
  buckets.length = 0;
  slowLoggedAt.clear();
}
