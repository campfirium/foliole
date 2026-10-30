import { beforeEach, describe, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({ prs: [] }));
vi.mock('./github-monitor-gh.mjs', () => ({
  getPrCheckSignal: () => ({ eventSuffix: 'failed', label: 'Failed checks' }),
  listPrChecks: () => [],
  recordMonitorError: (errors, source, detail, error) => errors.push({ source, detail, error }),
  runGh: () => github.prs
}));

import { listGithubMonitorEvents } from './github-desktop-handoff-events.mjs';
import { submitMonitorEvents } from './github-desktop-handoff-monitor.mjs';

const config = {
  prs: {
    enabled: true, repository: 'owner/repo', workspace: '/repo',
    autoImplementAuthors: ['app/dependabot'], dedupeKeyPattern: 'pr:{eventId}',
    template: 'pr.md', batchTemplate: 'batch.md'
  }
};
const bot = (number, title = 'Update dependency', baseRefName = 'dev') => ({
  number, title, baseRefName, author: { login: 'app/dependabot' },
  headRefName: `dependabot/${number}`, headRefOid: `head-${number}`,
  url: `https://github.com/owner/repo/pull/${number}`
});
const stateForScan = () => ({ actions: {}, issues: {}, prs: {}, submitted: {} });
const scan = (state) => listGithubMonitorEvents(config, state, false, [],
  (template, data) => JSON.stringify({ template, ...data }));
const deliver = (events, state, submit = () => undefined) => submitMonitorEvents(events, state, {
  persist: () => undefined, submit
});

describe('Dependabot batch notifications', () => {
  beforeEach(() => { github.prs = []; });

  it('notifies one mixed-risk batch while keeping every other author independent', () => {
    github.prs = [bot(3, 'Electron update'), bot(1, 'Security update'), bot(2),
      { ...bot(4), author: { login: 'octocat' } },
      { ...bot(5), author: { login: 'other-bot' } }];
    const events = scan(stateForScan());
    expect(events).toHaveLength(3);
    const batch = events.find((event) => event.prNumbers);
    expect(batch.prNumbers).toEqual(['1', '2', '3']);
    const prompt = JSON.parse(batch.prompt);
    expect(prompt.template).toBe('batch.md');
    for (const pr of github.prs.slice(0, 3)) expect(prompt.prList).toContain(pr.url);
    expect(events.filter((event) => !event.prNumbers).map((event) => event.number)).toEqual(['4', '5']);
  });

  it('checkpoints each member only after submission and does not re-notify after rebase', () => {
    github.prs = [bot(1), bot(2)];
    const state = stateForScan();
    const events = scan(state);
    expect(() => deliver(events, state, () => { throw new Error('unavailable'); })).toThrow('unavailable');
    expect(state.prs).toEqual({});
    expect(state.submitted).toEqual({});
    deliver(events, state);
    expect(Object.keys(state.prs).sort()).toEqual(['1', '2']);
    github.prs[0].headRefOid = 'rebased';
    expect(scan(JSON.parse(JSON.stringify(state)))).toEqual([]);
  });

  it('notifies only new arrivals even when older batch members remain open or disappear', () => {
    github.prs = [bot(1), bot(2)];
    const state = stateForScan();
    deliver(scan(state), state);
    github.prs = [bot(2), bot(3), bot(4)];
    const events = scan(state);
    expect(events).toHaveLength(1);
    expect(events[0].prNumbers).toEqual(['3', '4']);
  });

  it('preserves notification history from individual PR handoffs', () => {
    github.prs = [bot(1), bot(2), bot(3)];
    const state = stateForScan();
    state.prs['1'] = '1:local:old-head';
    state.submitted['pr:2:local'] = { emittedAt: '2026-10-30T00:00:00Z' };
    expect(scan(state)[0].prNumbers).toEqual(['3']);
  });

  it('keeps target branches separate and excludes drafts without consuming them', () => {
    github.prs = [bot(1), bot(2, 'Update', 'main'), { ...bot(3), isDraft: true }];
    const state = stateForScan();
    const events = scan(state);
    expect(events.map((event) => event.prNumbers)).toEqual([['1'], ['2']]);
    expect(state.prs).toEqual({});
    expect(state.submitted).toEqual({});
  });

  it('has a stable retry identity regardless of GitHub result ordering', () => {
    github.prs = [bot(2), bot(1)];
    const first = scan(stateForScan());
    github.prs.reverse();
    expect(scan(stateForScan()).map((event) => event.dedupeKey))
      .toEqual(first.map((event) => event.dedupeKey));
  });

  it('does not consume proposals if the batch template cannot render', () => {
    github.prs = [bot(1), bot(2)];
    const state = stateForScan();
    const errors = [];
    const events = listGithubMonitorEvents(config, state, false, errors, () => {
      throw new Error('missing template');
    });
    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(state.prs).toEqual({});
    expect(state.submitted).toEqual({});
  });
});
