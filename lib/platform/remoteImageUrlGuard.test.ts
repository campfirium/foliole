import { expect, it } from 'vitest';

import { isAllowedRemoteImageHostname } from './remoteImageUrlGuard.js';

const BLOCKED = [
  '0.0.0.0', '0.0.0.1', '10.1.2.3', '127.0.0.1', '169.254.169.254',
  '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.127.255.255',
  '224.0.0.1', '255.255.255.255', '192.0.0.1', '192.0.2.1', '198.18.0.1',
  '198.19.0.1', '198.51.100.1', '203.0.113.1'
];
const ALLOWED = ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0'];

it.each([...BLOCKED.map((host) => [host, false] as const), ...ALLOWED.map((host) => [host, true] as const)])(
  'applies the same IPv4 policy to mapped representations of %s', (host, allowed) => {
    const variants = [host, `[::ffff:${host}]`, `[0:0:0:0:0:FFFF:${host}]`];
    for (const variant of variants) {
      const hostname = new URL(`http://${variant}/image.png`).hostname;
      expect(isAllowedRemoteImageHostname(hostname), hostname).toBe(allowed);
    }
    expect(isAllowedRemoteImageHostname(`::ffff:${host}`)).toBe(allowed);
  }
);

it.each(['example.com', '[2606:4700:4700::1111]'])('keeps public host %s available', (host) => {
  expect(isAllowedRemoteImageHostname(new URL(`https://${host}/`).hostname)).toBe(true);
});
