import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { bindMonitorWorkspace, loadConfigs } from './github-desktop-handoff-monitor.mjs';

describe('github desktop handoff monitor workspace binding', () => {
  it('binds the current checkout without requiring a machine path in project declarations', () => {
    expect(bindMonitorWorkspace({ name: 'issues' }, '/workspace/foliole')).toEqual({
      name: 'issues',
      workspace: '/workspace/foliole'
    });
    expect(bindMonitorWorkspace(null, '/workspace/foliole')).toBeNull();
  });

  it('loads every enabled monitor against the current repository root', () => {
    const configs = loadConfigs();
    const expectedRoot = process.cwd();

    expect(path.resolve(configs.actions.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.issues.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.prs.workspace)).toBe(expectedRoot);
  });
});
