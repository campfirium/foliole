// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({ prs: [], checks: [] }));
vi.mock('./github-monitor-gh.mjs', async importOriginal => ({
  ...await importOriginal(),
  listPrChecks: () => github.checks,
  runGh: () => github.prs
}));

import { listGithubMonitorEvents } from './github-desktop-handoff-events.mjs';
import { submitMonitorEvents } from './github-desktop-handoff-monitor.mjs';

const config = { prs: {
  enabled: true, repository: 'campfirium/foliole', workspace: '/repo',
  dedupeKeyPattern: 'pr:{eventId}', template: 'review.md',
  includeNoChecks: true, failureBuckets: ['fail']
} };
const proposal = { number: 200, title: 'Update dependency', baseRefName: 'dev',
  author: { login: 'app/renovate' }, headRefName: 'renovate/dependency',
  headRefOid: 'initial-head', url: 'https://github.com/campfirium/foliole/pull/200' };
const initial = () => ({ actions: {}, issues: {}, prs: {}, submitted: {} });
const scan = state => listGithubMonitorEvents(config, state, false, [], (_template, data) => data.handlingMode);
let folder;
beforeEach(() => {
  github.prs = [{ ...proposal }];
  github.checks = [{ name: 'CI', bucket: 'pass' }];
  const base = path.resolve('.tmp/artifacts/T674-6');
  fs.mkdirSync(base, { recursive: true });
  folder = fs.mkdtempSync(path.join(base, 'renovate-notifications-'));
});
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

function deliver(state, events, submit = () => undefined) {
  submitMonitorEvents(events, state, {
    submit, persist: value => fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify(value))
  });
}
const restart = () => JSON.parse(fs.readFileSync(path.join(folder, 'state.json'), 'utf8'));

it('delivers a passing Renovate proposal for review once across rebase and checkpoint restart', () => {
  const state = initial();
  const events = scan(state);
  expect(events).toEqual([expect.objectContaining({
    number: '200', handlingMode: 'review', prompt: 'review', eventId: '200:proposal'
  })]);
  deliver(state, events);
  github.prs[0].headRefOid = 'rebased-head';
  expect(scan(restart())).toEqual([]);
});

it('uses the same proposal identity while checks are absent, pending or passing', () => {
  const state = initial();
  github.checks = [];
  const events = scan(state);
  expect(events[0]).toMatchObject({ eventId: '200:proposal', handlingMode: 'review' });
  deliver(state, events);
  github.checks = [{ name: 'CI', bucket: 'pending' }];
  expect(scan(restart())).toEqual([]);
  github.checks = [{ name: 'CI', bucket: 'pass' }];
  expect(scan(restart())).toEqual([]);
});

it('retries a proposal after failed delivery without consuming its checkpoint', () => {
  const state = initial();
  const events = scan(state);
  expect(events).toHaveLength(1);
  expect(() => deliver(state, events, () => { throw new Error('transport failed'); })).toThrow('transport failed');
  expect(state.prs).toEqual({});
  expect(scan(state).map(event => event.eventId)).toEqual(['200:proposal']);
});

it('keeps new failing-check signals after the proposal was delivered', () => {
  const state = initial();
  const proposalEvents = scan(state);
  expect(proposalEvents).toHaveLength(1);
  deliver(state, proposalEvents);
  github.checks = [{ name: 'native graph', bucket: 'fail' }];
  const restored = restart();
  const failed = scan(restored);
  expect(failed).toEqual([expect.objectContaining({ eventId: '200:native graph', handlingMode: 'review' })]);
  deliver(restored, failed);
  github.checks = [{ name: 'native graph', bucket: 'pass' }];
  expect(scan(restart())).toEqual([]);
});

it('does not send a second review proposal after an initial failure was already delivered', () => {
  github.checks = [{ name: 'CI', bucket: 'fail' }];
  const state = initial();
  deliver(state, scan(state));
  github.checks = [{ name: 'CI', bucket: 'pass' }];
  expect(scan(restart())).toEqual([]);
});

it('does not promote other authors or drafts into the Renovate review path', () => {
  github.prs = [{ ...proposal, author: { login: 'octocat' } },
    { ...proposal, number: 201, author: { login: 'renovate' } },
    { ...proposal, number: 202, isDraft: true }];
  expect(scan(initial())).toEqual([]);
});
