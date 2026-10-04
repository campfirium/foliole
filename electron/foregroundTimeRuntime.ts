import { randomUUID } from 'node:crypto';

import { app, BrowserWindow, powerMonitor } from 'electron';

import { computeSyncContentHash, upsertSyncObjectState } from '../lib/core/database/syncState.js';
import { ForegroundTimeCounter } from '../lib/core/review/foregroundTime.js';
import { foregroundTimeId } from '../lib/core/sync/syncForegroundDailyTime.js';

import { openDatabaseConnection, registerDatabaseConnectionCleanup, registerDatabaseConnectionReady, type DatabaseConnection } from './database/connection.js';
import { runDesktopDatabaseWrite } from './database/desktopDatabaseWriteQueue.js';
import { loadOrCreateDesktopHostName } from './database/hostProfile.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { loadReviewSchedulerSettings, subscribeReviewDayBoundary } from './reviewSchedulerSettings.js';

let connection: DatabaseConnection | null = null;
let sourceId = randomUUID();
let counter = createCounter();
let timer: ReturnType<typeof setInterval> | null = null;
let locked = false;
let suspended = false;
let quitting = false;
let active = false;
let failure: unknown = null;
let installed = false;

function createCounter() {
  return new ForegroundTimeCounter(() => ({ wallMs: Date.now(), monotonicMs: performance.now() }));
}

export function desktopForegroundTimeSnapshot() {
  if (failure) throw new Error('Foreground time could not be saved');
  return { sourceId, buckets: counter.snapshot() };
}

function save() {
  if (!connection) return;
  counter.setActive(active, loadReviewSchedulerSettings().newDayStartsAtHour);
  const driver = connection.driver;
  const buckets = counter.checkpoint();
  driver.transaction(() => {
    for (const bucket of buckets) {
      if (bucket.durationMs <= 0) continue;
      const id = foregroundTimeId(sourceId, bucket.day);
      const previous = driver.queryOne<{ duration_ms: number }>('SELECT duration_ms FROM foreground_daily_time WHERE id = ?', [id]);
      if (previous && previous.duration_ms >= bucket.durationMs) continue;
      driver.execute(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms`, [id, sourceId, bucket.day, bucket.durationMs]);
      upsertSyncObjectState(driver, { objectType: 'foreground_daily_time', objectId: id,
        contentHash: computeSyncContentHash('foreground_daily_time', {
          source_id: sourceId, day_key: bucket.day, duration_ms: bucket.durationMs
        }), lastModifiedByHostName: loadOrCreateDesktopHostName(), updatedAt: new Date().toISOString(), syncDirty: true });
    }
  });
  failure = null;
}

function report(error: unknown) { failure = error; appendMainProcessDiagnosticLog('foreground_time_save_failed', { error }); }

function queueSave() {
  const expected = connection;
  void runDesktopDatabaseWrite('background', () => {
    if (connection === expected) save();
  }).catch(report);
}

function update() {
  if (!connection) return;
  const focused = !locked && !suspended && !quitting && Boolean(BrowserWindow.getFocusedWindow());
  active = focused;
  const hour = loadReviewSchedulerSettings().newDayStartsAtHour;
  counter.setActive(focused, hour);
  if (focused && !timer) timer = setInterval(queueSave, 60_000);
  if (!focused && timer) { clearInterval(timer); timer = null; }
  if (!focused) queueSave();
}

export function startDesktopForegroundTime() {
  const next = openDatabaseConnection();
  if (connection === next) return;
  connection = next;
  failure = null;
  sourceId = randomUUID();
  counter = createCounter();
  active = false;
  quitting = false;
  if (!installed) {
    installed = true;
    registerDatabaseConnectionReady(startDesktopForegroundTime);
    subscribeReviewDayBoundary((hour) => {
      if (!connection) return;
      counter.setActive(active, hour);
      queueSave();
    });
    app.on('browser-window-focus', update);
    app.on('browser-window-blur', () => { queueMicrotask(update); });
    powerMonitor.on('lock-screen', () => { locked = true; update(); });
    powerMonitor.on('suspend', () => { suspended = true; update(); });
    powerMonitor.on('unlock-screen', () => { locked = false; update(); });
    powerMonitor.on('resume', () => { suspended = false; update(); });
    registerDatabaseConnectionCleanup(() => {
      active = false;
      counter.setActive(false, loadReviewSchedulerSettings().newDayStartsAtHour);
      try { save(); } catch (error) { report(error); throw error; }
      connection = null;
      if (timer) clearInterval(timer);
      timer = null;
    });
  }
  update();
}

export async function stopDesktopForegroundTime() {
  quitting = true;
  active = false;
  counter.setActive(false, loadReviewSchedulerSettings().newDayStartsAtHour);
  if (timer) clearInterval(timer);
  timer = null;
  await runDesktopDatabaseWrite('foreground', save);
}
