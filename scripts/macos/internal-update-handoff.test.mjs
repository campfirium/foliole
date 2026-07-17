/* global process */

import { describe, expect, it, vi } from 'vitest';

import {
  createInternalUpdateFailureHandoff, submitInternalUpdateFailureHandoff
} from './internal-update-handoff.mjs';

const REVISION = 'a'.repeat(40);

describe('Internal update failure handoff', () => {
  it('creates one revision-deduped diagnostic task without control characters', () => {
    const event = createInternalUpdateFailureHandoff({
      error: new Error('signing\nfailed'), revision: REVISION, stateRoot: '/repo/.tmp/update'
    });
    expect(event).toMatchObject({
      dedupeKey: `foliole:internal-update:${REVISION}`,
      source: 'foliole/internal-update',
      title: 'Foliole update failed (aaaaaaaa)'
    });
    expect(event.prompt).toContain('Error: signing failed');
    expect(event.prompt).toContain('Log: /repo/.tmp/update/build.log');
  });

  it('submits the failure through the existing desktop handoff runtime', () => {
    const run = vi.fn(() => ({ status: 0, stdout: '{"ok":true}' }));
    submitInternalUpdateFailureHandoff({
      error: new Error('build failed'), repositoryRoot: '/repo',
      revision: REVISION, stateRoot: '/repo/.tmp/update'
    }, { codexHome: '/codex', run });
    expect(run).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
      '/codex/skills/codex-desktop-handoff/scripts/submit-event.mjs',
      '--dedupe-key', `foliole:internal-update:${REVISION}`,
      '--title', 'Foliole update failed (aaaaaaaa)'
    ]), { cwd: '/repo', encoding: 'utf8' });
  });

  it('fails visibly when the desktop handoff event cannot be submitted', () => {
    const run = vi.fn(() => ({ status: 1, stderr: 'handoff unavailable' }));
    expect(() => submitInternalUpdateFailureHandoff({
      error: new Error('build failed'), repositoryRoot: '/repo',
      revision: REVISION, stateRoot: '/repo/.tmp/update'
    }, { codexHome: '/codex', run })).toThrow('handoff unavailable');
  });
});
