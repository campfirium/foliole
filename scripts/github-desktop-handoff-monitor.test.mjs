import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  bindMonitorWorkspace,
  loadConfigs,
  resolveRepositoryRoot
} from './github-desktop-handoff-monitor.mjs';

describe('github desktop handoff monitor workspace binding', () => {
  it('binds the current checkout without requiring a machine path in project declarations', () => {
    expect(bindMonitorWorkspace({ name: 'issues' }, '/workspace/foliole')).toEqual({
      name: 'issues',
      workspace: '/workspace/foliole'
    });
    expect(bindMonitorWorkspace(null, '/workspace/foliole')).toBeNull();
  });

  it('derives the repository root from the producer location instead of the caller cwd', () => {
    const producerUrl = new URL('file:///workspace/foliole/scripts/github-desktop-handoff-monitor.mjs');

    expect(resolveRepositoryRoot(producerUrl)).toBe(path.resolve('/workspace/foliole'));
  });

  it('loads every enabled monitor against the current repository root', () => {
    const configs = loadConfigs();
    const expectedRoot = process.cwd();

    expect(path.resolve(configs.actions.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.issues.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.prs.workspace)).toBe(expectedRoot);
  });
});
