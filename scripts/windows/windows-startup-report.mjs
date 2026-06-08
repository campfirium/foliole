/* global URL */

import { collectPostReadyActivity } from './windows-startup-post-ready-report.mjs';

const DEFAULT_BUDGETS = {
  appReadyMs: 12000,
  appResponsiveMs: 13000,
  backgroundTaskMs: 15000,
  bridgeReadyMs: 10000,
  postReadyHydrateCount: 5,
  postReadyWindowMs: 30000,
  prewarmMs: 3000,
  resourceMs: 3000,
  windowVisibleMs: 3000
};

const STAGE_KEYS = [
  'renderer_load_start',
  'window_visible',
  'main_window_ready',
  'bridge_ready',
  'app_ready',
  'app_responsive'
];
const REQUIRED_TIMING_KEYS = [
  'window_visible',
  'main_window_ready',
  'bridge_ready',
  'app_ready',
  'app_responsive'
];
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu');

function stripAnsi(text) {
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}

function readBudget(env, key, fallback) {
  const value = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveStartupBudgets(env = {}) {
  return {
    appReadyMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_APP_READY_MS', DEFAULT_BUDGETS.appReadyMs),
    appResponsiveMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_APP_RESPONSIVE_MS', DEFAULT_BUDGETS.appResponsiveMs),
    backgroundTaskMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_BACKGROUND_TASK_MS', DEFAULT_BUDGETS.backgroundTaskMs),
    bridgeReadyMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_BRIDGE_READY_MS', DEFAULT_BUDGETS.bridgeReadyMs),
    postReadyHydrateCount: readBudget(
      env,
      'FOLIOLE_STARTUP_BUDGET_POST_READY_HYDRATE_COUNT',
      DEFAULT_BUDGETS.postReadyHydrateCount
    ),
    postReadyWindowMs: readBudget(
      env,
      'FOLIOLE_STARTUP_BUDGET_POST_READY_WINDOW_MS',
      DEFAULT_BUDGETS.postReadyWindowMs
    ),
    prewarmMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_PREWARM_MS', DEFAULT_BUDGETS.prewarmMs),
    resourceMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_RESOURCE_MS', DEFAULT_BUDGETS.resourceMs),
    windowVisibleMs: readBudget(env, 'FOLIOLE_STARTUP_BUDGET_WINDOW_VISIBLE_MS', DEFAULT_BUDGETS.windowVisibleMs)
  };
}

function firstEventByStage(events) {
  const byStage = new Map();
  for (const event of events) {
    if (!byStage.has(event.stage)) {
      byStage.set(event.stage, event);
    }
  }
  return byStage;
}

function latestStartupCycle(events) {
  const bootIndex = events.findLastIndex((event) => event.stage === 'boot_start');
  if (bootIndex >= 0) {
    const mainIndex = events
      .slice(0, bootIndex + 1)
      .findLastIndex((event) => event.stage === 'main_process_start');
    const previousBootIndex = events
      .slice(0, bootIndex)
      .findLastIndex((event) => event.stage === 'boot_start');
    const startIndex = mainIndex >= 0 && mainIndex > previousBootIndex ? mainIndex : bootIndex;
    return events.slice(startIndex);
  }
  const mainIndex = events.findLastIndex((event) => event.stage === 'main_process_start');
  return mainIndex >= 0 ? events.slice(mainIndex) : events;
}

function elapsedMs(start, event) {
  if (!start || !event?.timestamp) return null;
  const value = Date.parse(event.timestamp) - Date.parse(start.timestamp);
  return Number.isFinite(value) ? value : null;
}

function parsePrewarmResource(line) {
  const match = line.match(/prewarm_resource path=(\S+) durationMs=(\d+) ok=(\S+)(?: status=(\d+)| error=(.*))?/u);
  if (!match) return null;
  return {
    durationMs: Number.parseInt(match[2], 10),
    error: match[5] ?? null,
    ok: match[3] === 'true',
    path: match[1],
    status: match[4] ? Number.parseInt(match[4], 10) : null
  };
}

export function parseStartupTiming(stdout) {
  const clean = stripAnsi(stdout);
  const result = { prewarmResources: [] };
  for (const line of clean.split(/\r?\n/u)) {
    const viteReady = line.match(/ready in\s+(\d+)\s*ms/u);
    if (viteReady) result.viteReadyMs = Number.parseInt(viteReady[1], 10);
    const prewarmDone = line.match(/prewarm_(complete|incomplete) totalDurationMs=(\d+)/u);
    if (prewarmDone) {
      result.prewarmFinalStatus = prewarmDone[1];
      result.prewarmTotalMs = Number.parseInt(prewarmDone[2], 10);
    }
    const launch = line.match(/electron_launch prewarmStatus=(\S+) prewarmElapsedMs=(\d+)/u);
    if (launch) {
      result.prewarmLaunchStatus = launch[1];
      result.prewarmLaunchElapsedMs = Number.parseInt(launch[2], 10);
    }
    const timeout = line.match(/prewarm_timeout elapsedMs=(\d+) budgetMs=(\d+)/u);
    if (timeout) result.prewarmTimeoutMs = Number.parseInt(timeout[1], 10);
    const resource = parsePrewarmResource(line);
    if (resource) result.prewarmResources.push(resource);
  }
  return result;
}

function normalizeResourceName(name) {
  if (!name) return 'unknown';
  try {
    const url = new URL(name);
    return `${url.pathname}${url.search}`;
  } catch {
    return name;
  }
}

function topBootResources(byStage) {
  const resources = byStage.get('boot_context')?.payload?.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .map((resource) => ({
      durationMs: Math.round(Number(resource.duration) || 0),
      name: normalizeResourceName(resource.name)
    }))
    .filter((resource) => resource.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 8);
}

function addBudgetFailure(failures, label, actualMs, budgetMs) {
  if (actualMs !== null && actualMs > budgetMs) {
    failures.push(`${label}=${actualMs}ms budget=${budgetMs}ms`);
  }
}

function missingRequiredTimings(timings) {
  return REQUIRED_TIMING_KEYS.filter((key) => timings[key] === null);
}

function resolveStatus(failures, missingTimings) {
  if (failures.length > 0) return 'FAILED';
  if (missingTimings.length > 0) return 'INCOMPLETE';
  return 'PASSED';
}

export function buildStartupReport({ budgets, events, session, stdout }) {
  const cycleEvents = latestStartupCycle(events);
  const byStage = firstEventByStage(cycleEvents);
  const start = byStage.get('main_process_start') ?? byStage.get('boot_start');
  const timings = {};
  for (const stage of STAGE_KEYS) {
    timings[stage] = elapsedMs(start, byStage.get(stage));
  }
  const stdoutTiming = parseStartupTiming(stdout);
  const resources = topBootResources(byStage);
  const postReadyActivity = collectPostReadyActivity(cycleEvents, byStage, budgets);
  const failures = [];
  addBudgetFailure(failures, 'prewarm', stdoutTiming.prewarmTotalMs ?? stdoutTiming.prewarmTimeoutMs ?? null, budgets.prewarmMs);
  addBudgetFailure(failures, 'window_visible', timings.window_visible, budgets.windowVisibleMs);
  addBudgetFailure(failures, 'bridge_ready', timings.bridge_ready, budgets.bridgeReadyMs);
  addBudgetFailure(failures, 'app_ready', timings.app_ready, budgets.appReadyMs);
  addBudgetFailure(failures, 'app_responsive', timings.app_responsive, budgets.appResponsiveMs);
  for (const resource of resources.filter((item) => item.durationMs > budgets.resourceMs).slice(0, 3)) {
    failures.push(`resource=${resource.durationMs}ms ${resource.name}`);
  }
  if (postReadyActivity.hydrateCount > budgets.postReadyHydrateCount) {
    failures.push(
      `post_ready_hydrate_count=${postReadyActivity.hydrateCount} budget=${budgets.postReadyHydrateCount}`
    );
  }
  for (const task of postReadyActivity.longBackgroundTasks.slice(0, 3)) {
    failures.push(`background_task=${task.durationMs}ms ${task.label}`);
  }
  const missingTimings = missingRequiredTimings(timings);
  return {
    budgets,
    failures,
    missingTimings,
    postReadyActivity,
    resources,
    session,
    status: resolveStatus(failures, missingTimings),
    stdoutTiming,
    timings
  };
}
