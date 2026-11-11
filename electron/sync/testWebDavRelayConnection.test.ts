import { expect, it } from 'vitest';

import { testWebDavRelayConnection } from './testWebDavRelayConnection.js';
import { withWebDavFixture } from './webDavRelay.testSupport.js';


it('probes read and write permissions without changing existing files', async () => {
  await withWebDavFixture(false, async (url, files) => {
    await testWebDavRelayConnection(url);
    expect([...files]).toEqual([['/relay/keep.bin', 'existing']]);
  });
});

it('fails the test and removes its file when the server returns incorrect data', async () => {
  await withWebDavFixture(true, async (url, files) => {
    await expect(testWebDavRelayConnection(url)).rejects.toThrow('different test data');
    expect([...files]).toEqual([['/relay/keep.bin', 'existing']]);
  });
});

it('refuses to send credentials to a cleartext WebDAV service', async () => {
  await withWebDavFixture(false, async (url, files) => {
    await expect(testWebDavRelayConnection(url, { credentials: { username: 'test-user', password: 'test-password' } }))
      .rejects.toThrow('webdav_relay_https_required');
    expect([...files]).toEqual([['/relay/keep.bin', 'existing']]);
  });
});
