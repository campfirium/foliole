import { app, BrowserWindow, powerMonitor } from 'electron';

import { ForegroundTimeRecording } from '../lib/core/review/foregroundTimeRecording.js';
import { SYNC_GROUP_OVERWRITE_PROGRESS_KEY } from '../lib/core/sync/syncGroupOverwriteProgress.js';

import { openDatabaseConnection, registerDatabaseConnectionCleanup, registerDatabaseConnectionReady, type DatabaseConnection } from './database/connection.js';
import { runDesktopDatabaseWrite } from './database/desktopDatabaseWriteQueue.js';
import { registerDesktopForegroundTimeMaintenance } from './database/foregroundTimeMaintenance.js';
import { readDesktopForegroundSource, saveDesktopForegroundSnapshot } from './database/foregroundTimePersistence.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { loadReviewSchedulerSettings, subscribeReviewDayBoundary } from './reviewSchedulerSettings.js';

let connection: DatabaseConnection | null = null;
let recording: ForegroundTimeRecording | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let locked = false;
let suspended = false;
let quitting = false;
let active = false;
let failure: unknown = null;
let installed = false;
let dayBoundaryHour = 4;

export function desktopForegroundTimeSnapshot() {
  if (failure) throw new Error('Foreground time could not be saved');
  return recording?.snapshot();
}

function save() {
  if (!connection || !recording || recording.maintaining) return;
  dayBoundaryHour = loadReviewSchedulerSettings().newDayStartsAtHour;
  recording.setActive(active, dayBoundaryHour);
  saveDesktopForegroundSnapshot(connection, { sourceId: recording.sourceId, buckets: recording.checkpoint() });
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
  if (!connection && !recording?.maintaining) return;
  const focused = !locked && !suspended && !quitting && Boolean(BrowserWindow.getFocusedWindow());
  active = focused;
  if (connection) dayBoundaryHour = loadReviewSchedulerSettings().newDayStartsAtHour;
  recording?.setActive(focused, dayBoundaryHour);
  if (focused && !timer) timer = setInterval(queueSave, 60_000);
  if (!focused && timer) { clearInterval(timer); timer = null; }
  if (!focused) queueSave();
}

export function startDesktopForegroundTime() {
  const next = openDatabaseConnection();
  if (connection === next) return;
  connection = next;
  failure = null;
  if (recording?.maintaining) { update(); return; }
  const source = readDesktopForegroundSource(next);
  recording = new ForegroundTimeRecording(() => ({ wallMs: Date.now(), monotonicMs: performance.now() }), source.sourceId, source.baseline);
  active = false;
  quitting = false;
  if (!installed) {
    installed = true;
    registerDatabaseConnectionReady(startDesktopForegroundTime);
    subscribeReviewDayBoundary((hour) => {
      dayBoundaryHour = hour;
      recording?.setActive(active, hour);
      queueSave();
    });
    app.on('browser-window-focus', update);
    app.on('browser-window-blur', () => { queueMicrotask(update); });
    powerMonitor.on('lock-screen', () => { locked = true; update(); });
    powerMonitor.on('suspend', () => { suspended = true; update(); });
    powerMonitor.on('unlock-screen', () => { locked = false; update(); });
    powerMonitor.on('resume', () => { suspended = false; update(); });
    registerDatabaseConnectionCleanup(() => {
      if (recording?.maintaining) { connection = null; return; }
      active = false;
      recording?.setActive(false, dayBoundaryHour);
      try { save(); } catch (error) { report(error); throw error; }
      connection = null;
      if (timer) clearInterval(timer);
      timer = null;
    });
  }
  registerDesktopForegroundTimeMaintenance({ begin: beginMaintenance, finish: finishMaintenance });
  if (next.driver.queryOne('SELECT value FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_OVERWRITE_PROGRESS_KEY])) {
    beginMaintenance();
  }
  update();
}

function beginMaintenance() {
  if (!recording || !connection || recording.maintaining) return;
  const snapshot = recording.beginMaintenance();
  try { saveDesktopForegroundSnapshot(connection, snapshot); }
  catch (error) { recording.cancelMaintenance(); report(error); throw error; }
}

function finishMaintenance() {
  if (!recording?.maintaining) return;
  try {
    connection = openDatabaseConnection();
    const source = readDesktopForegroundSource(connection);
    recording.finishMaintenance(source.sourceId, source.baseline);
    save();
  } catch (error) { report(error); throw error; }
}

export async function stopDesktopForegroundTime() {
  quitting = true;
  active = false;
  recording?.setActive(false, dayBoundaryHour);
  if (timer) clearInterval(timer);
  timer = null;
  await runDesktopDatabaseWrite('foreground', save);
}
