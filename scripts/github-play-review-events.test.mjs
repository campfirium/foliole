// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { availabilityFixture } from './android/play-availability-test-fixture.mjs';
import { checkRegisteredPlayAvailability } from './android/play-availability.mjs';
import { listPlayReviewEvents } from './github-play-review-events.mjs';
import { loadConfigs, submitMonitorEvents } from './github-desktop-handoff-monitor.mjs';

const close = [];
afterEach(async () => { for (const cleanup of close.splice(0)) await cleanup(); });
const config = { enabled: true, repository: 'campfirium/foliole', workspace: '/workspace',
  template: 'review.md', defaultTtlSeconds: 86400, dedupeKeyPattern: 'play:{eventId}' };
async function fixture() {
  const f = await availabilityFixture(); close.push(f.close);
  f.query = args => {
    expect(args.slice(2)).toEqual(['--paginate', '--slurp']);
    const statuses = /deployments\/(\d+)\/statuses/u.exec(args[1]);
    if (!statuses) return [f.rows];
    const history = f.histories.get(Number(statuses[1])) ?? [];
    return [history.slice(0, 100), history.slice(100)];
  };
  f.errors = [];
  f.events = state => listPlayReviewEvents(config, state, false, f.errors,
    (_template, data) => JSON.stringify(data), f.query);
  return f;
}

it('hands off approval, verified availability and rejection once across checks and producer restart', async () => {
  const f = await fixture();
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/play-notify-'));
  close.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  let state = { submitted: {} };
  const delivered = [];
  const emit = () => submitMonitorEvents(f.events(state), state, {
    submit: event => delivered.push(event), persist: value => fs.writeFileSync(file, JSON.stringify(value)) });
  await checkRegisteredPlayAvailability(f.clients());
  expect(f.events(state)).toEqual([]);
  f.lifecycle = 'APPROVED_NOT_PUBLISHED';
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
  emit();
  expect(delivered.map(event => event.signal)).toEqual(['approved']);
  expect(JSON.parse(delivered[0].prompt)).toMatchObject({ deploymentId: 71, versionCode: 4,
    lifecycle: 'APPROVED_NOT_PUBLISHED', url: expect.stringContaining(f.row.payload.runId) });
  state = JSON.parse(fs.readFileSync(file));
  await checkRegisteredPlayAvailability(f.clients()); emit();
  expect(delivered).toHaveLength(1);
  f.lifecycle = 'PUBLISHED'; f.track.releases[0].status = 'halted';
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting'); emit();
  expect(delivered).toHaveLength(1);
  f.track.releases[0].status = 'completed';
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('available'); emit();
  f.lifecycle = 'NOT_APPROVED';
  await checkRegisteredPlayAvailability(f.clients()); emit(); emit();
  expect(delivered.map(event => event.signal)).toEqual(['approved', 'available', 'rejected']);
  expect(f.errors).toEqual([]);
});

it('baselines existing results without suppressing a future availability notification', async () => {
  const f = await fixture(); f.lifecycle = 'APPROVED_NOT_PUBLISHED';
  await checkRegisteredPlayAvailability(f.clients());
  const state = { submitted: {} };
  expect(f.events(state)).toEqual([]);
  f.lifecycle = 'PUBLISHED'; await checkRegisteredPlayAvailability(f.clients());
  expect(f.events(state).map(event => event.signal)).toEqual(['available']);
});

it('retries failed delivery without acknowledging the signal', async () => {
  const f = await fixture(); const state = { submitted: {} };
  f.events(state); f.lifecycle = 'NOT_APPROVED';
  await checkRegisteredPlayAvailability(f.clients());
  expect(() => submitMonitorEvents(f.events(state), state, {
    submit: () => { throw new Error('offline'); }, persist: () => undefined })).toThrow('offline');
  expect(state.submitted).toEqual({});
  const delivered = [];
  submitMonitorEvents(f.events(state), state, { submit: event => delivered.push(event), persist: () => undefined });
  expect(delivered.map(event => event.signal)).toEqual(['rejected']);
});

it('keeps failed inventory reads uninitialized and rejects untrusted candidate or status ownership', async () => {
  const f = await fixture(); const state = {};
  const errors = [];
  expect(listPlayReviewEvents(config, state, false, errors, () => '', () => { throw new Error('offline'); })).toEqual([]);
  expect(state.playReviewBaseline).toBeUndefined();
  expect(errors).toHaveLength(1);
  f.row.creator.login = 'other-user'; expect(f.events(state)).toEqual([]);
  expect(state.playReviewBaseline).toBeUndefined();
  f.row.creator.login = 'github-actions[bot]';
  f.histories.get(71).unshift({ description: 'Play review: PUBLISHED', creator: { login: 'other-user' } });
  expect(f.events(state)).toEqual([]);
  expect(f.errors).toHaveLength(2);
});

it('reads old lifecycle receipts behind more than one status page and respects revoked availability', async () => {
  const f = await fixture(); const state = { submitted: {}, playReviewBaseline: [] };
  f.lifecycle = 'PUBLISHED'; await checkRegisteredPlayAvailability(f.clients());
  f.histories.get(71).unshift(...Array.from({ length: 105 }, () => f.status('Play snapshot: cleared')));
  expect(f.events(state).map(event => event.signal)).toEqual(['approved', 'available']);
  f.histories.get(71).unshift(f.status('Play availability: error'));
  expect(f.events(state).map(event => event.signal)).toEqual(['approved']);
});

it('loads the review declaration through the existing daemon producer and leaves disabled monitors idle', () => {
  const configs = loadConfigs({ monitorDir: '/fixtures', workspace: '/repo',
    readConfig: file => file.endsWith('github-play-review.json') ? config : null });
  expect(configs.playReview).toEqual({ ...config, workspace: '/repo' });
  expect(listPlayReviewEvents({ enabled: false }, {}, false, [], () => '',
    () => { throw new Error('unexpected query'); })).toEqual([]);
});
