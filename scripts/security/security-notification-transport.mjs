import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const securityCodexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
export const handoffRuntime = home => path.join(home, 'local-tools/desktop-handoff');

// Automated producers use the existing handoff inbox JSON contract.
export function enqueueSecurityNotification(event, { codexHome = securityCodexHome() } = {}) {
  const runtime = handoffRuntime(codexHome);
  const config = JSON.parse(readFileSync(path.join(runtime, 'config.json'), 'utf8'));
  if (event.prompt.length > (config.maxPromptLength ?? 6000)) throw new Error('Security prompt exceeds transport limit');
  const file = path.join(runtime, 'inbox', `${event.id}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    writeFileSync(temporary, `${JSON.stringify({ ...event, createdAt: new Date().toISOString(),
      priority: 'normal', reconcileOpen: false }, null, 2)}\n`, { flag: 'wx', mode: 0o600, flush: true });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
  return { eventId: event.id, eventFile: file };
}

function json(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function archives(runtime, directory, eventId) {
  const root = path.join(runtime, directory);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).filter(name =>
    path.basename(name).startsWith(`${eventId}.`) && name.endsWith('.json')).map(name => path.join(root, name));
}

export function securityDeliveryStatus(event, codexHome = securityCodexHome()) {
  const runtime = handoffRuntime(codexHome);
  const dead = archives(runtime, 'dead', event.id);
  const done = archives(runtime, 'done', event.id);
  const failed = done.find(file => file.endsWith('.thread-created-delivery-failed.json'));
  const delivered = done.find(file => file.endsWith('.thread-open-requested.json') || file.endsWith('.handoff-ready-recovered.json'));
  const dedupeFile = path.join(runtime, 'state/dedupe.json');
  const linked = existsSync(dedupeFile) ? json(dedupeFile)[event.dedupeKey] : null;
  const threadId = linked?.threadId ?? null;
  if (failed) return { status: 'desktop-open-failed', threadId, evidence: failed };
  if (delivered) return { status: 'thread-open-requested', threadId, evidence: delivered };
  if (dead.length) return { status: 'dead-letter', threadId, evidence: dead[0] };
  for (const directory of ['processing', 'inbox']) {
    const file = path.join(runtime, directory, `${event.id}.json`);
    if (existsSync(file)) return { status: directory === 'inbox' ? 'queued' : 'processing', threadId, evidence: file };
  }
  // Dedupe alone can refer to an unverified pending thread; never claim visible delivery.
  if (done.length) return { status: 'deduplicated-unverified', threadId, evidence: done[0] };
  return { status: 'unverified', threadId };
}
