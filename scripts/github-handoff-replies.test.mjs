import { expect, it, vi } from 'vitest';
import { collectReplyEvents } from './github-handoff-replies.mjs';

const config = { enabled: true, repository: 'campfirium/foliole', ownUserIds: [12] };
const baseline = '2026-11-15T00:00:00Z';
const cutoff = '2026-11-15T00:01:00Z';

function reply(id, authorId, kind = 'discussion') {
  const parentUrl = `https://github.com/campfirium/foliole/${kind}s/253`;
  return { id, authorId, number: 253, createdAt: baseline, parentUrl, url: `${parentUrl}#comment-${id}` };
}

it('baselines each feed, then hands off only external, unseen replies from both feeds', () => {
  const readers = {
    discussion: vi.fn(() => [reply('old', 9), reply('self', 12), reply('new', 9)]),
    issue: vi.fn(() => [reply('issue', 9, 'issue')])
  };
  const state = { submitted: { 'foliole/github-reply:campfirium/foliole:discussion:old': true } };
  const errors = [];
  const initial = collectReplyEvents(config, state, errors, baseline, readers);
  expect(initial.events).toEqual([]);
  expect(readers.discussion).not.toHaveBeenCalled();
  state.replyCheckpoints = initial.checkpoints;
  const next = collectReplyEvents(config, state, errors, cutoff, readers);
  expect(next.events.map(({ title }) => title)).toEqual(['新回复 · D253', '新回复 · Issue #253']);
  expect(next.events[0].prompt).toContain('/discussions/253#comment-new');
  expect(next.checkpoints).toEqual({ discussion: cutoff, issue: cutoff });
  expect(errors).toEqual([]);
});

it('keeps the failed feed checkpoint eligible for retry', () => {
  const state = { submitted: {}, replyCheckpoints: { discussion: baseline, issue: baseline } };
  const errors = [];
  const result = collectReplyEvents(config, state, errors, cutoff, {
    discussion: () => { throw new Error('GraphQL unavailable'); },
    issue: () => []
  });
  expect(result.checkpoints).toEqual({ issue: cutoff });
  expect(errors).toEqual([expect.objectContaining({ detail: 'discussion' })]);
});
