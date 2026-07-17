/* global process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOG_EXCERPT_CHARS = 1800;

function cleanMessage(error) {
  return Array.from(String(error instanceof Error ? error.message : error), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function resolveFolioleRuntimeLogPath(options = {}) {
  const homeDir = options.homeDir ?? os.homedir();
  const now = options.now ?? new Date();
  const dateKey = now.toISOString().slice(0, 10);
  return path.join(homeDir, 'Library', 'Logs', 'Foliole', `runtime-${dateKey}.ndjson`);
}

function readLogExcerpt(file, readFile = fs.readFileSync) {
  try {
    return Array.from(String(readFile(file, 'utf8')).slice(-LOG_EXCERPT_CHARS), (character) => {
      const code = character.charCodeAt(0);
      const forbiddenControl = (code < 32 && code !== 9 && code !== 10 && code !== 13)
        || code === 127;
      return forbiddenControl ? ' ' : character;
    }).join('');
  } catch {
    return `[log unavailable: ${file}]`;
  }
}

export function createInternalUpdateFailureHandoff(options) {
  const revision = options.revision;
  const shortRevision = revision.slice(0, 8);
  const buildLogPath = path.join(options.stateRoot, 'build.log');
  const runtimeLogPath = resolveFolioleRuntimeLogPath(options);
  const buildLogExcerpt = readLogExcerpt(buildLogPath, options.readFile);
  const runtimeLogExcerpt = readLogExcerpt(runtimeLogPath, options.readFile);
  return {
    dedupeKey: `foliole:internal-update:${revision}`,
    prompt: [
      'Foliole’s asynchronous Internal update failed after dispatch.',
      `Revision: ${revision}`,
      `Error: ${cleanMessage(options.error)}`,
      `Build log: ${buildLogPath}`,
      '--- bounded build log tail ---',
      buildLogExcerpt,
      `Foliole runtime log: ${runtimeLogPath}`,
      '--- bounded runtime log tail ---',
      runtimeLogExcerpt,
      'Diagnose only from the evidence embedded above. Do not use tools, inspect files, scan directories, or request permissions.',
      'Report the confirmed root cause. Do not change files unless the user asks, and do not replace asynchronous dispatch with synchronous waiting.'
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
