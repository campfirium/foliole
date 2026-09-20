import { describe, expect, it } from 'vitest';

import { buildMobileNodeLink, parseMobileNodeLink } from './mobileNodeLinkContract.js';

const link = 'foliole://node/v1?group=group-A&id=topic-A';

describe('mobile node locator contract', () => {
  it('round trips opaque group and node identities', () => {
    expect(parseMobileNodeLink(buildMobileNodeLink({ groupId: 'group-A', nodeId: 'topic-A' })))
      .toEqual({ version: 1, groupId: 'group-A', nodeId: 'topic-A' });
  });
  it.each([
    null, '', ` ${link}`, `${link}#`, `${link}#fragment`, `${link}&command=delete`, `${link}&id=B`,
    link.replace('foliole:', 'https:'), link.replace('/v1?', '/v2?'), link.replace('/v1?', '/x/../v1?'),
    link.replace('node/', 'user@node/'), link.replace('topic-A', '../file'),
    link.replace('topic-A', '%'), link.replace('topic-A', '%G0'), link.replace('topic-A', '%C3%28'),
    link.replace('topic-A', '%23fragment'), link.replace('topic-A', '%2Fetc%2Fpasswd'), link.replace('topic-A', '%00'),
    link.replace('topic-A', 'topic\n-A'), link.replace('topic-A', 'x'.repeat(129)), 'x'.repeat(513)
  ])('rejects unsupported or overprivileged input %s', (input) => {
    expect(parseMobileNodeLink(input)).toBeNull();
  });
  it('refuses to emit invalid identities', () => {
    expect(() => buildMobileNodeLink({ groupId: 'group-A', nodeId: '../file' })).toThrow();
  });
});
