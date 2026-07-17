/* global process */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function cleanMessage(error) {
  return Array.from(String(error instanceof Error ? error.message : error), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function createInternalUpdateFailureHandoff(options) {
  const revision = options.revision;
  const shortRevision = revision.slice(0, 8);
  const logPath = path.join(options.stateRoot, 'build.log');
  return {
    dedupeKey: `foliole:internal-update:${revision}`,
    prompt: [
      'Foliole’s asynchronous Internal update failed after dispatch.',
      `Revision: ${revision}`,
      `Error: ${cleanMessage(options.error)}`,
      `Log: ${logPath}`,
      'Inspect the failure and report the confirmed root cause. Do not change files unless the user asks, and do not replace asynchronous dispatch with synchronous waiting.'
    ].join('\n'),
    source: 'foliole/internal-update',
    title: `Foliole update failed (${shortRevision})`
  };
}

export function submitInternalUpdateFailureHandoff(options, dependencies = {}) {
  const run = dependencies.run ?? spawnSync;
  const codexHome = dependencies.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  const submitEvent = path.join(
    codexHome, 'skills', 'codex-desktop-handoff', 'scripts', 'submit-event.mjs'
  );
  const event = createInternalUpdateFailureHandoff(options);
  const result = run(process.execPath, [
    submitEvent, '--path', options.repositoryRoot, '--source', event.source,
    '--dedupe-key', event.dedupeKey, '--title', event.title,
    '--prompt', event.prompt, '--ttl', '86400'
  ], { cwd: options.repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'desktop handoff submission failed').trim());
  }
  return event;
}
