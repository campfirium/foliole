/* global process */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

function formatDateKey(value) {
  return value.toISOString().slice(0, 10);
}

export function resolveDesktopHostTimelinePath(now = new Date(), root = ROOT) {
  return path.join(root, '.tmp', 'diagnostics', `desktop-host-${formatDateKey(now)}.ndjson`);
}

export function appendDesktopHostTimelineEvent(input, options = {}) {
  const now = options.now ?? new Date();
  const logPath = resolveDesktopHostTimelinePath(now, options.root);
  const record = {
    event: input.event,
    occurredAt: now.toISOString(),
    operationId: input.operationId,
    payload: input.payload ?? {},
    pid: input.pid ?? process.pid,
    source: input.source
  };
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  return { logPath, record };
}
