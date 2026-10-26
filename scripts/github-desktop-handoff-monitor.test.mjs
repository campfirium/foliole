import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  bindMonitorWorkspace,
  loadConfigs,
  resolveRepositoryRoot,
  renderTemplate,
  submitMonitorEvents
} from './github-desktop-handoff-monitor.mjs';

describe('github desktop handoff monitor workspace binding', () => {
  it('hands off each signal once without reopening archived chats', () => {
    const event = { dedupeKey: 'pr:42:local', reconcileOpen: true, title: 'PR #42' };
    const state = { submitted: {} };
    const delivered = [];
    const options = {
      persist: () => undefined,
      submit: (value) => delivered.push(value)
    };

    submitMonitorEvents([event], state, options);
    submitMonitorEvents([event], state, options);

    expect(delivered).toEqual([{ ...event, reconcileOpen: false }]);
    expect(state.submitted[event.dedupeKey]).toBeDefined();
  });

  it('does not replay signals inherited from the previous notification producer', () => {
    const event = { dedupeKey: 'alerts:75', reconcileOpen: true };
    const state = { submitted: { 'alerts:75': { emittedAt: '2026-10-24T00:00:00Z' } } };

    submitMonitorEvents([event], state, {
      persist: () => { throw new Error('unexpected checkpoint'); },
      submit: () => { throw new Error('duplicate handoff'); }
    });
  });

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

  it('checkpoints a PR only after event submission succeeds', () => {
    const event = {
      dedupeKey: 'pr:42:local',
      eventId: '42:local',
      number: '42',
      source: 'foliole/github-pr',
      title: 'PR #42 Dependabot update'
    };
    const state = { dependabotAlerts: {}, prs: {}, submitted: {} };

    expect(() => submitMonitorEvents([event], state, {
      persist: () => undefined,
      submit: () => { throw new Error('submit failed'); }
    })).toThrow('submit failed');
    expect(state.prs).toEqual({});

    submitMonitorEvents([event], state, {
      now: () => '2026-09-01T00:00:00Z',
      persist: () => undefined,
      submit: () => ({ ok: true })
    });
    expect(state.prs).toEqual({ 42: '42:local' });
  });
});


describe('personal GitHub monitor configuration', () => {
  it('loads personal declarations with their current switches and binds the checkout', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-config-'));
    const monitorDir = path.join(codexHome, 'local-tools', 'desktop-handoff', 'projects', 'foliole', 'monitors');
    try {
      fs.mkdirSync(path.join(monitorDir, 'templates'), { recursive: true });
      fs.writeFileSync(path.join(monitorDir, 'templates/github-actions.md'), 'Run {{runId}} in {{workspace}}');
      fs.writeFileSync(path.join(monitorDir, 'github-actions.json'), JSON.stringify({
        enabled: true, template: 'templates/github-actions.md', pollIntervalSeconds: 60
      }));
      fs.writeFileSync(path.join(monitorDir, 'github-issues.json'), JSON.stringify({ enabled: false }));

      const configs = loadConfigs({ codexHome, workspace: '/current/checkout' });

      expect(configs.actions).toEqual({
        enabled: true,
        template: 'templates/github-actions.md',
        pollIntervalSeconds: 60,
        workspace: '/current/checkout'
      });
      expect(configs.issues).toEqual({ enabled: false, workspace: '/current/checkout' });
      expect(configs.prs).toBeNull();
      expect(renderTemplate(configs.actions.template, {
        runId: '123', workspace: configs.actions.workspace
      }, monitorDir)).toBe('Run 123 in /current/checkout');

      const status = JSON.parse(execFileSync(process.execPath, [
        path.join(process.cwd(), 'scripts/github-desktop-handoff-monitor.mjs'), 'status'
      ], { cwd: codexHome, env: { ...process.env, CODEX_HOME: codexHome }, encoding: 'utf8' }));
      expect(status.configs.actions.enabled).toBe(true);
      expect(status.configs.actions.workspace).toBe(process.cwd());
      expect(status.configs.issues.enabled).toBe(false);
    } finally {
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });
});
