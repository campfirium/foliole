/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
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

function runGh(args) {
  const result = spawnSync('gh', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return JSON.parse(result.stdout || 'null');
}

function renderTemplate(templatePath, data) {
  const template = fs.readFileSync(path.join(REPO_ROOT, templatePath), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(data[key] ?? ''));
}

function loadConfigs() {
  return {
    actions: readJson(path.join(MONITOR_DIR, 'github-actions.json')),
    prs: readJson(path.join(MONITOR_DIR, 'github-prs.json'))
  };
}

function loadState() {
  return readJson(STATE_FILE, { actions: {}, prs: {}, submitted: {} });
}

function actionRunEvent(config, run) {
  const data = {
    branch: run.headBranch,
    eventId: String(run.databaseId),
    headSha: run.headSha,
    repository: config.repository,
    runId: String(run.databaseId),
    runTitle: run.displayTitle,
    source: 'foliole/github-actions',
    url: run.url,
    workflow: run.workflowName,
    workspace: config.workspace
  };
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    title: `Foliole Actions failed: ${run.workflowName}`,
    ...data,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function prEvent(config, pr, checks) {
  const failing = checks.filter((check) => config.failureBuckets.includes(check.bucket));
  const data = {
    author: pr.author?.login ?? pr.author?.name ?? '',
    baseRefName: pr.baseRefName,
    eventId: `${pr.number}:${failing.map((check) => check.name).sort().join('|')}`,
    failingChecks: failing.map((check) => check.name).join(', '),
    headRefName: pr.headRefName,
    number: String(pr.number),
    repository: config.repository,
    source: 'foliole/github-pr',
    title: pr.title,
    url: pr.url,
    workspace: config.workspace
  };
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    title: `Foliole PR checks failed: #${pr.number}`,
    ...data,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function listActionEvents(config, state, includeExisting) {
  if (!config?.enabled) return [];
  const events = [];
  const workflows = config.workflows ?? [];
  for (const workflow of workflows) {
    const runs = runGh([
      'run',
      'list',
      '--repo',
      config.repository,
      '--workflow',
      workflow,
      '--limit',
      '10',
      '--json',
      'databaseId,conclusion,status,displayTitle,headSha,headBranch,url,workflowName,createdAt'
    ]);
    const latestId = String(runs[0]?.databaseId ?? '');
    const seenId = state.actions[workflow];
    if (!includeExisting && !seenId) {
      state.actions[workflow] = latestId;
      continue;
    }
    for (const run of runs) {
      if (!includeExisting && String(run.databaseId) === seenId) break;
      if (run.status === 'completed' && config.failureConclusions.includes(run.conclusion)) {
        events.push(actionRunEvent(config, run));
      }
    }
    state.actions[workflow] = latestId;
  }
  return events;
}

function listPrEvents(config, state, includeExisting) {
  if (!config?.enabled) return [];
  const prs = runGh([
    'pr',
    'list',
    '--repo',
    config.repository,
    '--state',
    'open',
    '--json',
    'number,title,headRefName,baseRefName,isDraft,author,url,updatedAt',
    '--limit',
    '50'
  ]);
  const events = [];
  for (const pr of prs) {
    if (pr.isDraft && !config.includeDrafts) continue;
    const checks = runGh(['pr', 'checks', String(pr.number), '--repo', config.repository, '--json', 'name,state,bucket,workflow,link,description']);
    const event = prEvent(config, pr, checks);
    if (!event.failingChecks) continue;
    if (!includeExisting && state.prs[String(pr.number)] === event.eventId) continue;
    events.push(event);
    state.prs[String(pr.number)] = event.eventId;
  }
  return events;
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

function scan({ emit = false, includeExisting = false } = {}) {
  const configs = loadConfigs();
  const state = loadState();
  const events = [
    ...listActionEvents(configs.actions, state, includeExisting),
    ...listPrEvents(configs.prs, state, includeExisting)
  ].filter((event) => includeExisting || !state.submitted[event.dedupeKey]);
  if (emit) {
    for (const event of events) {
      state.submitted[event.dedupeKey] = { emittedAt: new Date().toISOString(), title: event.title };
      submitEvent(event);
    }
  }
  writeJson(STATE_FILE, state);
  return { emit, events, stateFile: STATE_FILE };
}

async function monitor() {
  const configs = loadConfigs();
  const interval = Math.max(configs.actions?.pollIntervalSeconds ?? 900, configs.prs?.pollIntervalSeconds ?? 900);
  for (;;) {
    console.log(JSON.stringify({ ...scan({ emit: true }), checkedAt: new Date().toISOString() }));
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
}

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
