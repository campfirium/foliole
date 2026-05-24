import fs from 'node:fs';

function readBootEventLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/u).filter(Boolean);
  } catch {
    return [];
  }
}

function parseBootEvent(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function readStartupFailureFromBootEvents(eventLogFile, options = {}) {
  if (Object.hasOwn(options, 'session') && !options.session) {
    return null;
  }
  const lines = readBootEventLines(eventLogFile);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const event = parseBootEvent(lines[index]);
    if (event?.stage !== 'startup_runtime_services_failed') {
      continue;
    }
    if (options.session && event.session !== options.session) {
      continue;
    }
    return event;
  }
  return null;
}

export function formatStartupFailureReason(event) {
  if (!event) {
    return 'app-ready-timeout';
  }
  const moduleLabel = typeof event.payload?.moduleLabel === 'string' ? event.payload.moduleLabel : 'Startup services';
  const message = typeof event.payload?.message === 'string' && event.payload.message.trim()
    ? event.payload.message.trim()
    : 'unknown startup failure';
  return `startup runtime failed: ${moduleLabel}: ${message}`;
}

export function readNativeRunnerFailureFromLog(stderrLog) {
  try {
    const content = fs.readFileSync(stderrLog, 'utf8');
    const match = content.match(/Error:\s+([^\r\n]+)/u);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

export function formatStartupHealthFailure({ bootEvent, stderrLog }) {
  return readNativeRunnerFailureFromLog(stderrLog) ?? formatStartupFailureReason(bootEvent);
}
