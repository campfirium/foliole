/* global console, process, setTimeout */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listGithubMonitorEvents } from './github-desktop-handoff-events.mjs';

export function resolveRepositoryRoot(moduleUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '..');
}

const REPO_ROOT = resolveRepositoryRoot();
const MONITOR_DIR = path.join(REPO_ROOT, '.codex', 'monitors');
const STATE_FILE = path.join(REPO_ROOT, '.tmp', 'github-desktop-handoff-monitor', 'state.json');
const SUBMIT_EVENT = path.join(
  os.homedir(),
  '.codex',
  'skills',
  'codex-desktop-handoff',
  'scripts',
  'submit-event.mjs'
);

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderTemplate(templatePath, data) {
  const template = fs.readFileSync(path.join(REPO_ROOT, templatePath), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(data[key] ?? ''));
}

export function bindMonitorWorkspace(config, workspace) {
  return config ? { ...config, workspace } : config;
}

export function loadConfigs(options = {}) {
  const monitorDir = options.monitorDir ?? MONITOR_DIR;
  const readConfig = options.readConfig ?? readJson;
  const workspace = options.workspace ?? REPO_ROOT;
  return {
    actions: bindMonitorWorkspace(readConfig(path.join(monitorDir, 'github-actions.json')), workspace),
    dependabotAlerts: bindMonitorWorkspace(readConfig(path.join(monitorDir, 'github-dependabot-alerts.json')), workspace),
    issues: bindMonitorWorkspace(readConfig(path.join(monitorDir, 'github-issues.json')), workspace),
    prs: bindMonitorWorkspace(readConfig(path.join(monitorDir, 'github-prs.json')), workspace)
  };
}

function loadState() {
  const state = readJson(STATE_FILE, {});
  return {
    ...state,
    actions: state.actions ?? {},
    dependabotAlerts: state.dependabotAlerts ?? {},
    issues: state.issues ?? {},
    prs: state.prs ?? {},
    submitted: state.submitted ?? {}
  };
}

function submitEvent(event) {
  const result = spawnSync(process.execPath, [
    SUBMIT_EVENT,
    '--path',
    REPO_ROOT,
    '--source',
    event.source,
    '--dedupe-key',
    event.dedupeKey,
    ...(event.reconcileOpen ? ['--reconcile-open'] : []),
    '--title',
    event.title,
    '--prompt',
    event.prompt,
    '--ttl',
    String(event.ttlSeconds ?? 1800)
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout).trim());
  }
  return JSON.parse(result.stdout);
}

function acknowledgeEvent(state, event, emittedAt) {
  for (const alertNumber of event.alertNumbers ?? []) {
    state.dependabotAlerts[String(alertNumber)] = { emittedAt, title: event.title };
  }
  if (event.source === 'foliole/github-pr' && event.number) {
    state.prs[String(event.number)] = event.eventId;
  }
}

export function submitMonitorEvents(events, state, options = {}) {
  const submit = options.submit ?? submitEvent;
  const persist = options.persist ?? ((value) => writeJson(STATE_FILE, value));
  const now = options.now ?? (() => new Date().toISOString());
  for (const event of events) {
    submit(event);
    const emittedAt = now();
    state.submitted[event.dedupeKey] = { emittedAt, title: event.title };
    acknowledgeEvent(state, event, emittedAt);
    persist(state);
  }
}

function scan({ emit = false, includeExisting = false } = {}) {
  const configs = loadConfigs();
  const persistedState = loadState();
  const state = emit ? persistedState : cloneJson(persistedState);
  const errors = [];
  const events = listGithubMonitorEvents(configs, state, includeExisting, errors, renderTemplate)
    .filter((event) => event.reconcileOpen || includeExisting || !state.submitted[event.dedupeKey]);
  state.lastErrors = errors;
  state.lastCheckedAt = new Date().toISOString();
  if (emit) writeJson(STATE_FILE, state);
  if (emit) submitMonitorEvents(events, state);
  return { emit, events, stateFile: STATE_FILE };
}

async function monitor() {
  const configs = loadConfigs();
  const interval = Math.max(configs.actions?.pollIntervalSeconds ?? 900, configs.dependabotAlerts?.pollIntervalSeconds ?? 900, configs.prs?.pollIntervalSeconds ?? 900, configs.issues?.pollIntervalSeconds ?? 900);
  for (;;) {
    console.log(JSON.stringify({ ...scan({ emit: true }), checkedAt: new Date().toISOString() }));
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const command = process.argv[2] ?? 'status';
  if (command === 'status') {
    console.log(JSON.stringify({ configs: loadConfigs(), state: loadState() }, null, 2));
  } else if (command === 'scan') {
    console.log(JSON.stringify(scan({ emit: process.argv.includes('--emit'), includeExisting: process.argv.includes('--include-existing') }), null, 2));
  } else if (command === 'monitor') {
    await monitor();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}
