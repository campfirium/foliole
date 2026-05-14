#!/usr/bin/env node
/* global process */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const IMPORTANT_STAGES = new Set([
  'database_init_complete',
  'renderer_load_complete',
  'bridge_ready',
  'window_error',
  'renderer_error_boundary',
  'app_ready_timeout',
  'app_ready'
]);

function defaultLogDir() {
  const user = process.env.USER || process.env.USERNAME || 'zephu';
  return `/mnt/c/Users/${user}/AppData/Roaming/foliole/logs/windows`;
}

function parseEvents(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function sameSession(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

function compact(value) {
  return String(value ?? '').trim();
}

function lastMatching(events, predicate) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) {
      return events[index];
    }
  }
  return null;
}

function summarizeError(event) {
  if (!event) {
    return 'none';
  }
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const message = compact(payload.message) || compact(payload.error) || event.stage;
  const source = compact(payload.source || payload.sourceId);
  const line = payload.line ? `:${payload.line}` : '';
  return source ? `${message} (${source}${line})` : message;
}

function summarizeMilestones(events) {
  const stages = [];
  for (const event of events) {
    if (!IMPORTANT_STAGES.has(event.stage) || stages.at(-1) === event.stage) {
      continue;
    }
    stages.push(event.stage);
  }
  return stages.length > 0 ? stages.join(' -> ') : 'none';
}

export function buildStartupFailureDiagnostics(logDir) {
  const events = parseEvents(path.join(logDir, 'native-boot-events.ndjson'));
  if (events.length === 0) {
    return ['[windows-startup-diagnostics] no native boot events found'];
  }
  const latest = events.at(-1);
  const session = compact(latest.session);
  const sessionEvents = session ? events.filter((event) => sameSession(event.session, session)) : events;
  const errorEvent = lastMatching(sessionEvents, (event) =>
    event.stage === 'window_error' || event.stage === 'renderer_error_boundary'
  );
  const head = compact(latest.head);
  const pid = compact(latest.pid);
  return [
    `[windows-startup-diagnostics] session=${session || 'unknown'} head=${head || 'unknown'} pid=${pid || 'unknown'}`,
    `[windows-startup-diagnostics] latest renderer error: ${summarizeError(errorEvent)}`,
    `[windows-startup-diagnostics] milestones: ${summarizeMilestones(sessionEvents)}`
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const logDir = process.env.FOLIOLE_WINDOWS_LOG_DIR || defaultLogDir();
  process.stdout.write(`${buildStartupFailureDiagnostics(logDir).join('\n')}\n`);
}
