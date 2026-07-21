/* global process */

import { expect, it, vi } from 'vitest';

import {
  createScheduledPushBlockedHandoff,
  submitScheduledPushBlockedHandoff
} from './scheduled-dev-push-handoff.mjs';

const STATE = {
  localOnly: 107,
  remoteOnly: 2,
  remoteRevision: 'a'.repeat(40),
  status: 'diverged'
};

it('creates one remote-revision-deduped blocked push task', () => {
  const event = createScheduledPushBlockedHandoff({ repositoryRoot: '/repo', state: STATE });
  expect(event).toMatchObject({
    dedupeKey: `foliole:scheduled-dev-push:diverged:${'a'.repeat(40)}`,
    source: 'foliole/scheduled-dev-push',
    title: 'Foliole dev push blocked (diverged, aaaaaaaa)'
  });
  expect(event.prompt).toContain('Remote-only commits: 2');
  expect(event.prompt).toContain('Local-only commits: 107');
  expect(event.prompt).toContain('Do not force push, reset, discard worktree changes');
});

it('submits the blocked push through the existing desktop handoff runtime', () => {
  const run = vi.fn(() => ({ status: 0, stdout: '{"ok":true}' }));
  submitScheduledPushBlockedHandoff({ repositoryRoot: '/repo', state: STATE }, {
    codexHome: '/codex', run
  });
  expect(run).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
    '/codex/skills/codex-desktop-handoff/scripts/submit-event.mjs',
    '--dedupe-key', `foliole:scheduled-dev-push:diverged:${'a'.repeat(40)}`
  ]), { cwd: '/repo', encoding: 'utf8' });
});
