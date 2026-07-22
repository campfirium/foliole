import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

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
    const producerUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'github-desktop-handoff-monitor.mjs'));

    expect(resolveRepositoryRoot(producerUrl)).toBe(process.cwd());
  });

  it('loads every monitor slot against the supplied repository root', () => {
    const expectedRoot = process.cwd();
    const configs = loadConfigs({
      monitorDir: '/monitor-fixtures',
      readConfig: (filePath) => ({ name: path.basename(filePath, '.json') }),
      workspace: expectedRoot
    });

    expect(path.resolve(configs.actions.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.issues.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.prs.workspace)).toBe(expectedRoot);
    expect(configs.actions.name).toBe('github-actions');
  });
});
