import { sqlFingerprint } from './sqlFingerprint.js';
import type { FinishSqlRecording, SqlRecordingGroup, SqlRecordingOptions, SqlRecordingReport } from './sqlRecordingTypes.js';

export class SqlRecording {
  private report: SqlRecordingReport | null = null;
  private groups = new Map<string, SqlRecordingGroup>();
  private started = 0;
  private label = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  onStopped: ((report: SqlRecordingReport) => void) | undefined;

  constructor(private readonly now = () => performance.now()) {}

  start(options: SqlRecordingOptions = {}) {
    if (this.report?.running || this.report?.pending) throw new Error('sql_recording_already_active');
    const durationMs = bounded(options.durationMs ?? 60_000, 1, 600_000);
    const windowMs = bounded(options.windowMs ?? 1000, 100, 60_000);
    const maxGroups = bounded(options.maxGroups ?? 500, 1, 2000);
    this.started = this.now();
    this.label = (options.label ?? 'unlabelled').slice(0, 80);
    this.groups = new Map();
    this.report = { version: 1, startedAt: new Date().toISOString(), durationMs: 0,
      running: true, pending: 0, overflowOperations: 0, groups: [], windows: [], marks: [],
      limits: { durationMs, windowMs, maxGroups } };
    this.timer = setTimeout(() => this.stop(), durationMs);
    return this.snapshot();
  }

  mark(label: string) {
    if (!this.accepting()) return;
    this.label = label.slice(0, 80);
    if (this.report!.marks.length < 100) this.report!.marks.push({ offsetMs: this.offset(), label: this.label });
  }

  begin(sql: string, method: string, host: string): FinishSqlRecording | null {
    if (!this.accepting()) return null;
    const report = this.report!;
    const offset = this.offset();
    const fingerprint = sqlFingerprint(sql);
    const key = JSON.stringify([host, method, this.label, fingerprint]);
    let group = this.groups.get(key);
    if (!group && this.groups.size < report.limits.maxGroups) {
      group = { sql: fingerprint, method, host, label: this.label, caller: caller(),
        count: 0, errors: 0, returnedRows: 0, totalMs: 0, maxMs: 0 };
      this.groups.set(key, group);
    }
    if (!group) report.overflowOperations++;
    const bucket = Math.floor(offset / report.limits.windowMs);
    const window = report.windows[bucket] ?? { offsetMs: bucket * report.limits.windowMs, count: 0, totalMs: 0, maxMs: 0 };
    report.windows[bucket] = window;
    window.count++;
    report.pending++;
    let finished = false;
    return (ms, rows, failed) => {
      if (finished) return;
      finished = true;
      if (group) {
        group.count++; group.errors += Number(failed); group.returnedRows += rows;
        group.totalMs += ms; group.maxMs = Math.max(group.maxMs, ms);
      }
      window.totalMs += ms; window.maxMs = Math.max(window.maxMs, ms);
      report.pending--;
      if (!report.running && report.pending === 0) this.publish();
    };
  }

  measure<T>(sql: string, method: string, host: string, execute: () => T): T {
    const finish = this.begin(sql, method, host);
    if (!finish) return execute();
    const started = this.now();
    try { const value = execute(); finish(this.now() - started, rowCount(value, method), false); return value; }
    catch (error) { finish(this.now() - started, 0, true); throw error; }
  }

  async measureAsync<T>(sql: string, method: string, host: string, execute: () => Promise<T>): Promise<T> {
    const finish = this.begin(sql, method, host);
    if (!finish) return execute();
    const started = this.now();
    try { const value = await execute(); finish(this.now() - started, rowCount(value, method), false); return value; }
    catch (error) { finish(this.now() - started, 0, true); throw error; }
  }

  stop() {
    if (this.report?.running) {
      this.report.durationMs = Math.min(this.offset(), this.report.limits.durationMs);
      this.report.running = false;
      clearTimeout(this.timer);
      this.publish();
    }
    return this.snapshot();
  }

  snapshot(): SqlRecordingReport | null {
    if (!this.report) return null;
    return { ...this.report, durationMs: this.report.running ? this.offset() : this.report.durationMs,
      limits: { ...this.report.limits }, marks: this.report.marks.map(mark => ({ ...mark })),
      groups: [...this.groups.values()].map(group => ({ ...group })).sort((a, b) => b.totalMs - a.totalMs),
      windows: this.report.windows.filter(Boolean).map(window => ({ ...window })) };
  }

  private accepting() {
    if (this.report?.running && this.offset() >= this.report.limits.durationMs) this.stop();
    return Boolean(this.report?.running);
  }
  private offset() { return Math.max(0, this.now() - this.started); }
  private publish() {
    try { this.onStopped?.(this.snapshot()!); }
    catch { /* Diagnostic export failures must never change database results. */ }
  }
}

function bounded(value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('sql_recording_invalid_limit');
  return value;
}
function rowCount(value: unknown, method: string) {
  return Array.isArray(value) ? value.length : method === 'get' && value !== undefined ? 1 : 0;
}
function caller() {
  return (new Error().stack ?? '').split('\n').slice(1)
    .filter(line => !/sqlRecording|sqliteStatementCache|node_modules/u.test(line)).slice(0, 3).join('\n');
}

export const sqlRecording = new SqlRecording();
