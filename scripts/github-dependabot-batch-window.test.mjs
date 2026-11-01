import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({ prs: [], error: null }));
vi.mock('./github-monitor-gh.mjs', () => ({
  listPrChecks: () => [],
  getPrCheckSignal: () => ({ eventSuffix: 'failed', label: 'Failed checks' }),
  recordMonitorError: (errors, source, detail, error) => errors.push({ source, detail, error }),
  runGh: () => {
    if (github.error) throw github.error;
    return github.prs;
  }
}));

import { listGithubMonitorEvents } from './github-desktop-handoff-events.mjs';
import { submitMonitorEvents } from './github-desktop-handoff-monitor.mjs';

const config = {
  enabled: true, repository: 'owner/repo', workspace: '/repo',
  dedupeKeyPattern: 'pr:{eventId}', template: 'pr.md', batchTemplate: 'batch.md'
};
const bot = (number, baseRefName = 'dev') => ({
  number, baseRefName, title: `Update ${number}`, author: { login: 'app/dependabot' },
  headRefName: `dependabot/${number}`, headRefOid: `head-${number}`,
  url: `https://github.com/owner/repo/pull/${number}`
});
const initialState = () => ({ actions: {}, issues: {}, prs: {}, submitted: {} });
const scan = (state, overrides = {}, errors = []) => listGithubMonitorEvents(
  { prs: { ...config, ...overrides } }, state, false, errors,
  (_template, data) => data.prList ?? data.url
);
const advance = (seconds) => vi.setSystemTime(Date.now() + seconds * 1000);
const deliver = (events, state, submit = () => undefined) => submitMonitorEvents(events, state, {
  submit, persist: () => undefined
});

describe('Dependabot arrival coalescing across scans', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T07:07:38Z'));
    github.prs = [];
    github.error = null;
  });
  afterEach(() => vi.useRealTimers());

  it('delivers the observed one-four-one arrival wave as one complete batch after restart', () => {
    let state = initialState();
    github.prs = [bot(179)];
    expect(scan(state)).toEqual([]);
    advance(60);
    github.prs.push(...[180, 181, 182, 183].map(number => bot(number)));
    expect(scan(state)).toEqual([]);
    state = JSON.parse(JSON.stringify(state));
    advance(60);
    github.prs.push(bot(184));
    expect(scan(state)).toEqual([]);
    advance(299);
    expect(scan(state)).toEqual([]);
    advance(1);
    const events = scan(state);
    expect(events).toHaveLength(1);
    expect(events[0].prNumbers).toEqual(['179', '180', '181', '182', '183', '184']);
    for (const proposal of github.prs) expect(events[0].prompt).toContain(proposal.url);
    const submitted = [];
    deliver(events, state, event => submitted.push(event));
    expect(submitted).toHaveLength(1);
    expect(Object.keys(state.prs)).toHaveLength(6);
    expect(scan(JSON.parse(JSON.stringify(state)))).toEqual([]);
  });

  it('does not stretch the quiet period for rebases or reordered scan results', () => {
    const state = initialState();
    github.prs = [bot(1), bot(2)];
    expect(scan(state)).toEqual([]);
    advance(240);
    github.prs.reverse();
    github.prs[0].headRefOid = 'rebased';
    expect(scan(state)).toEqual([]);
    advance(60);
    expect(scan(state)[0].prNumbers).toEqual(['1', '2']);
  });

  it('caps deferral from the first arrival even while more proposals keep appearing', () => {
    const state = initialState();
    github.prs = [bot(1)];
    expect(scan(state)).toEqual([]);
    for (let number = 2; number <= 8; number += 1) {
      advance(240);
      github.prs.push(bot(number));
      expect(scan(state)).toEqual([]);
    }
    advance(120);
    github.prs.push(bot(9));
    expect(scan(state)[0].prNumbers).toHaveLength(9);
  });

  it('keeps branch deadlines independent and leaves non-Dependabot signals immediate', () => {
    const state = initialState();
    github.prs = [bot(1)];
    expect(scan(state)).toEqual([]);
    advance(240);
    github.prs.push(bot(2, 'main'), { ...bot(3), author: { login: 'octocat' } });
    expect(scan(state).map(event => event.number)).toEqual(['3']);
    advance(60);
    expect(scan(state).find(event => event.prNumbers)?.prNumbers).toEqual(['1']);
    advance(240);
    expect(scan(state).filter(event => event.prNumbers).map(event => event.prNumbers))
      .toEqual([['1'], ['2']]);
  });

  it('drops closed or newly draft proposals without consuming them or resetting the deadline', () => {
    const state = initialState();
    github.prs = [bot(1), bot(2), bot(3)];
    expect(scan(state)).toEqual([]);
    advance(300);
    github.prs = [bot(2), { ...bot(3), isDraft: true }];
    const events = scan(state);
    expect(events[0].prNumbers).toEqual(['2']);
    deliver(events, state);
    expect(Object.keys(state.prs)).toEqual(['2']);
    github.prs = [];
    expect(scan(state)).toEqual([]);
    expect(state.dependabotBatches).toEqual({});
    github.prs = [bot(3)];
    expect(scan(state)).toEqual([]);
    advance(300);
    expect(scan(state)[0].prNumbers).toEqual(['3']);
  });

  it('retries failed submission immediately without consuming the ready batch', () => {
    const state = initialState();
    github.prs = [bot(1)];
    expect(scan(state)).toEqual([]);
    advance(300);
    const events = scan(state);
    expect(() => deliver(events, state, () => { throw new Error('offline'); })).toThrow('offline');
    expect(state.prs).toEqual({});
    expect(scan(JSON.parse(JSON.stringify(state)))[0].dedupeKey).toBe(events[0].dedupeKey);
    deliver(events, state);
    expect(state.dependabotBatches).toEqual({});
    github.prs.push(bot(2));
    expect(scan(state)).toEqual([]);
    advance(300);
    expect(scan(state)[0].prNumbers).toEqual(['2']);
  });

  it('retains pending arrivals across API and template failures', () => {
    const state = initialState();
    github.prs = [bot(1)];
    expect(scan(state)).toEqual([]);
    const pending = JSON.stringify(state.dependabotBatches);
    advance(300);
    github.error = new Error('API unavailable');
    const errors = [];
    expect(scan(state, {}, errors)).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(state.dependabotBatches)).toBe(pending);
    github.error = null;
    expect(listGithubMonitorEvents({ prs: config }, state, false, [], () => {
      throw new Error('template unavailable');
    })).toEqual([]);
    expect(state.prs).toEqual({});
    expect(scan(state)[0].prNumbers).toEqual(['1']);
  });

  it('starts a fresh window after every pending member closes', () => {
    const state = initialState();
    github.prs = [bot(1)];
    expect(scan(state)).toEqual([]);
    advance(300);
    github.prs = [];
    expect(scan(state)).toEqual([]);
    expect(state.dependabotBatches).toEqual({});
    github.prs = [bot(2)];
    expect(scan(state)).toEqual([]);
    advance(300);
    expect(scan(state)[0].prNumbers).toEqual(['2']);
  });

  it('preserves delivered checkpoints and isolates repository windows', () => {
    const state = initialState();
    state.prs['1'] = 'previous-batch';
    state.submitted['pr:2:local'] = { emittedAt: '2026-10-30T00:00:00Z' };
    github.prs = [bot(1), bot(2), bot(3)];
    expect(scan(state)).toEqual([]);
    advance(240);
    expect(scan(state, { repository: 'owner/other' })).toEqual([]);
    advance(60);
    expect(scan(state)[0].prNumbers).toEqual(['3']);
    expect(scan(state, { repository: 'owner/other' })).toEqual([]);
    advance(240);
    expect(scan(state, { repository: 'owner/other' })[0].prNumbers).toEqual(['3']);
  });
});
