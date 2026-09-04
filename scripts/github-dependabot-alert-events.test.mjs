import { beforeEach, describe, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({ alerts: [], error: null, runGh: vi.fn() }));

vi.mock('./github-monitor-gh.mjs', () => ({
  recordMonitorError: vi.fn((errors, source, detail, error) => {
    errors.push({ detail, message: error.message, source });
  }),
  runGh: github.runGh
}));

const { listDependabotAlertEvents } = await import('./github-dependabot-alert-events.mjs');

function alert(number, overrides = {}) {
  return {
    dependency: {
      manifest_path: 'package-lock.json',
      package: { name: overrides.packageName ?? 'fast-uri' },
      scope: overrides.scope ?? 'development'
    },
    html_url: `https://github.test/security/dependabot/${number}`,
    number,
    security_advisory: { severity: overrides.severity ?? 'high' },
    security_vulnerability: {
      first_patched_version: { identifier: overrides.patchedVersion ?? '3.1.4' },
      severity: overrides.severity ?? 'high'
    },
    state: overrides.state ?? 'open'
  };
}

function config(overrides = {}) {
  return {
    dedupeKeyPattern: 'foliole:dependabot-alerts:{eventId}',
    defaultTtlSeconds: 1800,
    enabled: true,
    maxPromptChars: 12000,
    repository: 'campfirium/foliole',
    template: 'alerts.md',
    workspace: '/repo',
    ...overrides
  };
}

function renderTemplate(_template, data) {
  return `${data.repository}\n${data.alerts}\nDo not merge, close, dismiss, or run broad npm audit fix.`;
}

beforeEach(() => {
  github.alerts = [];
  github.error = null;
  github.runGh.mockReset().mockImplementation(() => {
    if (github.error) throw github.error;
    return [github.alerts];
  });
});
describe('Dependabot alert handoff events', () => {
  it('does not query or emit while disabled', () => {
    expect(listDependabotAlertEvents(config({ enabled: false }), {}, [], renderTemplate)).toEqual([]);
    expect(github.runGh).not.toHaveBeenCalled();
  });

  it('combines current open alerts in stable number order on the first scan', () => {
    github.alerts = [alert(35), alert(34, { packageName: 'dompurify', scope: 'runtime', severity: 'low' })];

    const events = listDependabotAlertEvents(config(), {}, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      alertNumbers: ['34', '35'],
      dedupeKey: 'foliole:dependabot-alerts:34-35',
      source: 'foliole/dependabot-alerts',
      reconcileOpen: true,
      title: 'Foliole Dependabot health: 2 open alerts'
    });
    expect(events[0].prompt).toContain('#34 | low | dompurify | runtime | package-lock.json | 3.1.4');
    expect(events[0].prompt).toContain('Do not merge, close, dismiss, or run broad npm audit fix.');
    expect(github.runGh).toHaveBeenCalledWith([
      'api', '--paginate', '--slurp',
      'repos/campfirium/foliole/dependabot/alerts?state=open&per_page=100'
    ]);
  });

  it('reconciles every currently open alert even after earlier delivery', () => {
    github.alerts = [alert(34), alert(35)];
    const state = { dependabotAlerts: { 34: { emittedAt: '2026-07-23T01:00:00Z' } } };

    const [event] = listDependabotAlertEvents(config(), state, [], renderTemplate);

    expect(event.alertNumbers).toEqual(['34', '35']);
    expect(event.prompt).toContain('#34 |');
  });

  it('records API failures without advancing alert state', () => {
    github.error = new Error('HTTP 403: Dependabot alerts read permission required');
    const errors = [];
    const state = { dependabotAlerts: {} };

    expect(listDependabotAlertEvents(config(), state, errors, renderTemplate)).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ source: 'github-dependabot-alerts' })]);
    expect(state.dependabotAlerts).toEqual({});
  });

  it('rejects an oversized prompt without checkpointing any alert', () => {
    github.alerts = [alert(35)];
    const errors = [];
    const state = { dependabotAlerts: {} };

    expect(listDependabotAlertEvents(config({ maxPromptChars: 10 }), state, errors, renderTemplate)).toEqual([]);
    expect(errors[0].message).toContain('exceeds 10 characters');
    expect(state.dependabotAlerts).toEqual({});
  });
});
