// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { listDiscussionEvents } from './github-desktop-handoff-discussions.mjs';
import { submitMonitorEvents } from './github-desktop-handoff-monitor.mjs';

const config = { enabled: true, repository: 'campfirium/foliole', template: 'discussion' };
const discussion = (number) => ({
  number,
  title: 'Image controls',
  url: `https://github.com/campfirium/foliole/discussions/${number}`
});

describe('GitHub discussion handoff', () => {
  it('baselines existing posts, reuses an existing D chat and retries an unqueued discussion', () => {
    const state = { submitted: {} };
    const errors = [];
    const read = vi.fn().mockReturnValueOnce([discussion(256)])
      .mockReturnValue([discussion(258), discussion(257), discussion(256)]);
    const collect = () => listDiscussionEvents(config, state, false, errors, (_, row) => row.url, read);

    expect(collect()).toEqual([]);
    expect(state.latestDiscussionNumber).toBe(256);
    const options = {
      discussionExists: ({ number }) => number === 257,
      submit: vi.fn().mockImplementationOnce(() => { throw new Error('Queue unavailable'); }),
      persist: vi.fn()
    };

    expect(() => submitMonitorEvents(collect(), state, options)).toThrow('Queue unavailable');
    expect(state.latestDiscussionNumber).toBe(257);
    const retry = collect();
    expect(retry).toEqual([expect.objectContaining({
      title: 'D258 Image controls',
      prompt: discussion(258).url,
      dedupeKey: 'foliole/github-discussion:campfirium/foliole:258'
    })]);
    submitMonitorEvents(retry, state, options);
    expect(collect()).toEqual([]);
    expect(options.submit.mock.calls.map(([event]) => event.number)).toEqual([258, 258]);
    expect(errors).toEqual([]);
  });
});
