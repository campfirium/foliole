/* global process */

import { describe, expect, it, vi } from 'vitest';

import {
  createInternalUpdateFailureHandoff,
  resolveFolioleRuntimeLogPath,
  returnInternalUpdateFailureToOrigin,
  submitInternalUpdateFailureHandoff
} from './internal-update-handoff.mjs';

const REVISION = 'a'.repeat(40);

describe('Internal update failure handoff', () => {
  it('resolves the fixed Foliole runtime log with the UTC diagnostic date', () => {
    expect(resolveFolioleRuntimeLogPath({
      homeDir: '/Users/tester', now: new Date('2026-07-17T16:30:00+08:00')
    })).toBe('/Users/tester/Library/Logs/Foliole/runtime-2026-07-17.ndjson');
  });

  it('creates one revision-deduped diagnostic task without control characters', () => {
    const readFile = vi.fn((file) => file.endsWith('build.log')
      ? `old-${'x'.repeat(1900)}\nbuild failed`
      : 'runtime event\u0000 failed');
    const event = createInternalUpdateFailureHandoff({
      error: new Error('signing\nfailed'), homeDir: '/Users/tester',
      now: new Date('2026-07-17T23:30:00-07:00'),
      readFile, revision: REVISION, stateRoot: '/repo/.tmp/update'
    });
    expect(event).toMatchObject({
      dedupeKey: `foliole:internal-update:${REVISION}`,
      source: 'foliole/internal-update',
      title: 'Foliole update failed (aaaaaaaa)'
    });
    expect(event.prompt).toContain('Error: signing failed');
    expect(event.prompt).toContain('Build log: /repo/.tmp/update/build.log');
    expect(event.prompt).toContain(
      'Foliole runtime log: /Users/tester/Library/Logs/Foliole/runtime-2026-07-18.ndjson'
    );
    expect(event.prompt).toContain('build failed');
    expect(event.prompt).toContain('runtime event  failed');
    expect(event.prompt).not.toContain('old-');
    expect(event.prompt).toContain('Diagnose only from the evidence embedded above');
    expect(event.prompt).toContain('Do not use tools, inspect files, scan directories, or request permissions');
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('marks exact logs unavailable without searching for substitutes', () => {
    const event = createInternalUpdateFailureHandoff({
      error: new Error('failed'), homeDir: '/Users/tester',
      now: new Date('2026-07-17T08:00:00Z'), readFile: () => { throw new Error('missing'); },
      revision: REVISION, stateRoot: '/repo/.tmp/update'
    });
    expect(event.prompt).toContain('[log unavailable: /repo/.tmp/update/build.log]');
    expect(event.prompt).toContain(
      '[log unavailable: /Users/tester/Library/Logs/Foliole/runtime-2026-07-17.ndjson]'
    );
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

  it('restores, resumes, and opens the originating thread when one was recorded', () => {
    const run = vi.fn()
      .mockReturnValueOnce({ status: 1, stderr: 'already active' })
      .mockReturnValueOnce({ status: 0, stdout: '{"type":"turn.completed"}' })
      .mockReturnValueOnce({ status: 0 });
    const originThreadId = '019f8432-790a-7b00-8708-7500d74a56b8';
    const result = returnInternalUpdateFailureToOrigin({
      error: new Error('build failed'), originThreadId, repositoryRoot: '/repo',
      revision: REVISION, stateRoot: '/repo/.tmp/update'
    }, { codexCommand: '/codex/bin/codex', run });
    expect(run.mock.calls[0][1]).toEqual(['unarchive', originThreadId]);
    expect(run.mock.calls[1][1]).toEqual(expect.arrayContaining([
      'exec', 'resume', '--json', originThreadId
    ]));
    expect(run.mock.calls[2][0]).toBe('/usr/bin/open');
    expect(run.mock.calls[2][1]).toEqual([`codex://threads/${originThreadId}`]);
    expect(result).toMatchObject({ originThreadId, route: 'origin-thread' });
  });

  it('routes recorded origins without creating a new desktop handoff event', () => {
    const run = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });
    submitInternalUpdateFailureHandoff({
      error: new Error('build failed'),
      originThreadId: '019f8432-790a-7b00-8708-7500d74a56b8',
      repositoryRoot: '/repo', revision: REVISION, stateRoot: '/repo/.tmp/update'
    }, { run });
    expect(run).not.toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
      '/codex/skills/codex-desktop-handoff/scripts/submit-event.mjs'
    ]), expect.anything());
  });

  it('fails visibly when the desktop handoff event cannot be submitted', () => {
    const run = vi.fn(() => ({ status: 1, stderr: 'handoff unavailable' }));
    expect(() => submitInternalUpdateFailureHandoff({
      error: new Error('build failed'), repositoryRoot: '/repo',
      revision: REVISION, stateRoot: '/repo/.tmp/update'
    }, { codexHome: '/codex', run })).toThrow('handoff unavailable');
  });
});
