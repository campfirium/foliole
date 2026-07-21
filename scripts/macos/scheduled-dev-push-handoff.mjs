/* global process */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export function createScheduledPushBlockedHandoff(options) {
  const { localOnly, remoteOnly, remoteRevision, status } = options.state;
  const shortRevision = remoteRevision.slice(0, 8);
  return {
    dedupeKey: `foliole:scheduled-dev-push:${status}:${remoteRevision}`,
    prompt: [
      'Foliole scheduled dev push stopped before changing the remote branch.',
      `State: ${status}`,
      `Remote-only commits: ${remoteOnly}`,
      `Local-only commits: ${localOnly}`,
      `Remote revision: ${remoteRevision}`,
      `Workspace: ${options.repositoryRoot}`,
      'Inspect the exact local and remote commits and report the reconciliation needed.',
      'Do not force push, reset, discard worktree changes, or merge while unrelated work is unsafe.',
      'Treat pull requests as local implementation input; do not repair this by merging another PR remotely.'
    ].join('\n'),
    source: 'foliole/scheduled-dev-push',
    title: `Foliole dev push blocked (${status}, ${shortRevision})`
  };
}

export function submitScheduledPushBlockedHandoff(options, dependencies = {}) {
  const run = dependencies.run ?? spawnSync;
  const codexHome = dependencies.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  const submitEvent = path.join(codexHome, 'skills', 'codex-desktop-handoff', 'scripts', 'submit-event.mjs');
  const event = createScheduledPushBlockedHandoff(options);
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
