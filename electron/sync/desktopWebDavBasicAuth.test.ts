import { Readable } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { webDavRelayStatus, type WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';

import { withDesktopWebDavBasicAuth } from './desktopWebDavBasicAuth.js';

it('sends Basic authorization only within the chosen HTTPS directory', async () => {
  const root = new URL('https://dav.example.test/relay/');
  const sent = vi.fn();
  const transport: WebDavRelayRequest = async (url, input, receive) => {
    sent(url.href, input);
    return receive(207, Readable.from([]));
  };
  const request = withDesktopWebDavBasicAuth(transport, root, { username: 'mac', password: 'app:password' });
  await expect(request(root, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus)).resolves.toBe(207);
  expect(sent).toHaveBeenCalledWith(root.href, {
    method: 'PROPFIND', headers: { Depth: '0', Authorization: 'Basic bWFjOmFwcDpwYXNzd29yZA==' }
  });

  const outside = ['https://other.example.test/relay/', 'http://dav.example.test/relay/',
    'https://dav.example.test/relay-other/', 'https://dav.example.test/relay/?another=value'];
  for (const url of outside) {
    await expect(request(new URL(url), { method: 'PROPFIND' }, webDavRelayStatus))
      .rejects.toThrow('webdav_relay_credential_scope_changed');
    await expect(request(new URL('pending', root), { method: 'MOVE', headers: { Destination: url } }, webDavRelayStatus))
      .rejects.toThrow('webdav_relay_credential_scope_changed');
  }
  expect(sent).toHaveBeenCalledTimes(1);
});
