import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  bindMonitorWorkspace,
  loadConfigs,
  resolveRepositoryRoot,
  submitMonitorEvents
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
    expect(path.resolve(configs.dependabotAlerts.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.issues.workspace)).toBe(expectedRoot);
    expect(path.resolve(configs.prs.workspace)).toBe(expectedRoot);
    expect(configs.actions.name).toBe('github-actions');
    expect(configs.dependabotAlerts.name).toBe('github-dependabot-alerts');
  });

  it('checkpoints alerts only after event submission succeeds', () => {
    const event = { alertNumbers: ['34', '35'], dedupeKey: 'alerts:34-35', title: 'Alerts' };
    const state = { dependabotAlerts: {}, submitted: {} };

    expect(() => submitMonitorEvents([event], state, {
      persist: () => undefined,
      submit: () => { throw new Error('submit failed'); }
    })).toThrow('submit failed');
    expect(state).toEqual({ dependabotAlerts: {}, submitted: {} });

    submitMonitorEvents([event], state, {
      now: () => '2026-07-23T02:00:00Z',
      persist: () => undefined,
      submit: () => ({ ok: true })
    });
    expect(state.dependabotAlerts).toEqual({
      34: { emittedAt: '2026-07-23T02:00:00Z', title: 'Alerts' },
      35: { emittedAt: '2026-07-23T02:00:00Z', title: 'Alerts' }
    });
  });
});
