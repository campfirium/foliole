// @vitest-environment node
import { expect, it } from 'vitest';
import { channelProjection } from './site-store-status.mjs';

it('opens only the exact published build with a matching installation', () => {
  const candidate = { version: '0.8.1', versionCode: 5 };
  const url = 'https://play.google.com/apps/testing/com.campfirium.foliole.android';
  const installation = { version: '0.8.1', build: '5', url };
  expect(channelProjection(candidate, 'in-review', installation, url)).not.toHaveProperty('url');
  expect(channelProjection(candidate, 'rejected', installation, url)).not.toHaveProperty('url');
  expect(channelProjection(candidate, 'available', { ...installation, build: '4' }, url))
    .toMatchObject({ status: 'verifying' });
  expect(channelProjection(candidate, 'available', installation, url))
    .toMatchObject({ status: 'available', url, version: '0.8.1' });
});
