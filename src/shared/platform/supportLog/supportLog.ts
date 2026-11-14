import packageJson from '../../../../package.json';

import { startAndroidSelectionTrace, stopAndroidSelectionTrace, validateAndroidSelectionTrace } from './androidSelectionTrace';

const eventNames = [
  'runtime.warning', 'runtime.error', 'selection.toolbar.shown', 'selection.toolbar.no_range',
  'selection.toolbar.collapsed',
  'selection.apply.started', 'selection.apply.finished', 'selection.apply.failed'
] as const;

type EventName = typeof eventNames[number];
type Entry = { event: EventName; elapsedMs: number; count: number };
type State = { phase: 'idle' | 'recording' | 'ready'; startedAt: number };
const duration = 300_000;
const maxEntries = 256;
const storageKey = 'foliole-support-log';
const retention = 86_400_000;
const idle: State = { phase: 'idle', startedAt: 0 };
let state = idle;
let entries: Entry[] = [];
let omitted = 0;
let timer: ReturnType<typeof setTimeout>;
let initialized = false;
let expiresAt = 0;
let completed: ReturnType<typeof makeReport> | undefined;
const subscribers = new Set<() => void>();

function makeReport(elapsedMs: number, events: Entry[], dropped: number,
  androidSelection?: ReturnType<typeof stopAndroidSelectionTrace>, appVersion: string = packageJson.version) {
  return { schemaVersion: 1, appVersion, elapsedMs, events, omittedEventCount: dropped,
    ...(androidSelection ? { androidSelection } : {}) };
}

function validEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Entry;
  return Object.keys(entry).length === 3 && eventNames.includes(entry.event)
    && Number.isSafeInteger(entry.elapsedMs) && entry.elapsedMs >= 0 && entry.elapsedMs <= duration
    && Number.isSafeInteger(entry.count) && entry.count > 0;
}

function loadCompleted() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    const report = saved?.report;
    if (typeof saved?.expiresAt !== 'number' || saved.expiresAt <= Date.now()
      || !Number.isSafeInteger(report?.elapsedMs) || report.elapsedMs < 0 || report.elapsedMs > duration
      || !Number.isSafeInteger(report.omittedEventCount) || report.omittedEventCount < 0
      || !Array.isArray(report.events) || report.events.length > maxEntries || !report.events.every(validEntry)) {
      localStorage.removeItem(storageKey);
      return;
    }
    expiresAt = saved.expiresAt;
    completed = makeReport(report.elapsedMs, report.events, report.omittedEventCount,
      validateAndroidSelectionTrace(report.androidSelection) ? report.androidSelection : undefined,
      typeof report.appVersion === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/iu.test(report.appVersion)
        ? report.appVersion : undefined);
    state = { phase: 'ready', startedAt: 0 };
  } catch {
    // An unavailable or unreadable browser store has no previous export.
  }
}

function publish(next: State) {
  state = next;
  subscribers.forEach(notify => notify());
}

export function getSupportLogState() {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;
    loadCompleted();
  }
  if (state.phase === 'recording' && Date.now() - state.startedAt >= duration) {
    // The timeout may be suspended while the WebView is in the background.
    queueMicrotask(stopSupportLog);
  } else if (state.phase === 'ready' && Date.now() >= expiresAt) {
    queueMicrotask(expireSupportLog);
  }
  return state;
}

function expireSupportLog() {
  if (state.phase !== 'ready' || Date.now() < expiresAt) return;
  completed = undefined;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // The expired report is unavailable for export even if storage fails.
  }
  publish(idle);
}

export function subscribeSupportLog(notify: () => void) {
  subscribers.add(notify);
  return () => { subscribers.delete(notify); };
}

export function startSupportLog(androidSelection = false) {
  if (state.phase === 'recording') return;
  entries = [];
  omitted = 0;
  publish({ phase: 'recording', startedAt: Date.now() });
  if (androidSelection) startAndroidSelectionTrace();
  timer = setTimeout(stopSupportLog, duration);
}

export function stopSupportLog() {
  if (state.phase !== 'recording') return;
  clearTimeout(timer);
  const elapsed = Math.min(duration, Math.max(0, Date.now() - state.startedAt));
  completed = makeReport(elapsed, entries, omitted, stopAndroidSelectionTrace());
  expiresAt = Date.now() + retention;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ report: completed, expiresAt }));
  } catch {
    // The current session remains exportable if browser storage is unavailable.
  }
  publish({ phase: 'ready', startedAt: 0 });
}

export function recordSupportEvent(event: EventName) {
  if (state.phase !== 'recording' || !eventNames.includes(event)) return;
  const elapsedMs = Math.max(0, Date.now() - state.startedAt);
  if (elapsedMs >= duration) {
    stopSupportLog();
    return;
  }
  const last = entries.at(-1);
  if (last?.event === event) {
    last.count += 1;
    return;
  }
  const routine = event.startsWith('runtime.') || event.startsWith('selection.toolbar.');
  if (entries.length >= (routine ? maxEntries - 32 : maxEntries)) {
    omitted += 1;
    return;
  }
  entries.push({ event, elapsedMs, count: 1 });
}

export function hasAndroidSelectionSupportReport() {
  return Boolean(completed?.androidSelection);
}

export function serializeSupportLog(platform: 'desktop' | 'android' | 'ios', androidSelection?: boolean) {
  expireSupportLog();
  if (state.phase !== 'ready' || !completed || !completed.events.every(validEntry)) return null;
  const { androidSelection: trace, ...report } = completed;
  if (androidSelection && !trace) return null;
  return JSON.stringify({ ...report, ...(trace && androidSelection !== false ? { androidSelection: trace } : {}), platform },
    null, trace && androidSelection !== false ? undefined : 2);
}
