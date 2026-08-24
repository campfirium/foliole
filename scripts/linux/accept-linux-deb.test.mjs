// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertDebContents,
  assertLinuxAcceptanceHost,
  withLinuxMdnsAcceptanceInterface
} from './accept-linux-deb.mjs';
import { resolveLinuxMdnsObserverOptions } from './discover-foliole-mdns.mjs';

it('accepts only the installed Ubuntu release architecture', () => {
  expect(() => assertLinuxAcceptanceHost('linux', 'x64')).not.toThrow();
  expect(() => assertLinuxAcceptanceHost('linux', 'arm64')).toThrow('Linux x64');
  expect(() => assertLinuxAcceptanceHost('darwin', 'x64')).toThrow('Linux x64');
});

it('requires installed integration without Linux updater metadata', () => {
  const contents = [
    './opt/Foliole/foliole',
    './opt/Foliole/bin/foliole',
    './opt/Foliole/resources/apparmor-profile',
    './usr/share/applications/foliole.desktop'
  ].join('\n');

  expect(() => assertDebContents(contents)).not.toThrow();
  expect(() => assertDebContents(`${contents}\n./opt/Foliole/resources/app-update.yml`))
    .toThrow('app-update.yml');
  expect(() => assertDebContents(`${contents}\n./usr/bin/foliole-global-clip`))
    .toThrow('foliole-global-clip');
  expect(() => assertDebContents(`${contents}\n./usr/share/applications/foliole-global-capture.desktop`))
    .toThrow('foliole-global-capture.desktop');
  expect(() => assertDebContents(`${contents}\n./opt/Foliole/bin/codex`))
    .toThrow('./opt/Foliole/bin/codex');
});

it('owns a deterministic multicast LAN interface for packaged acceptance', () => {
  const calls = [];
  expect(() => withLinuxMdnsAcceptanceInterface(() => {
    calls.push(['accept']);
    throw new Error('acceptance failed');
  }, (...args) => calls.push(args))).toThrow('acceptance failed');

  expect(calls).toEqual([
    ['sudo', ['ip', 'netns', 'add', 'foliole-mdns-peer']],
    ['sudo', ['ip', 'link', 'add', 'foliole-mdns0', 'type', 'veth', 'peer', 'name', 'foliole-mdns1']],
    ['sudo', ['ip', 'link', 'set', 'foliole-mdns1', 'netns', 'foliole-mdns-peer']],
    ['sudo', ['ip', 'address', 'add', '192.0.2.1/30', 'dev', 'foliole-mdns0']],
    ['sudo', ['ip', 'link', 'set', 'dev', 'foliole-mdns0', 'multicast', 'on', 'up']],
    ['sudo', ['ip', 'netns', 'exec', 'foliole-mdns-peer',
      'ip', 'address', 'add', '192.0.2.2/30', 'dev', 'foliole-mdns1']],
    ['sudo', ['ip', 'netns', 'exec', 'foliole-mdns-peer',
      'ip', 'link', 'set', 'dev', 'foliole-mdns1', 'multicast', 'on', 'up']],
    ['accept'],
    ['sudo', ['ip', 'link', 'delete', 'foliole-mdns0']],
    ['sudo', ['ip', 'netns', 'delete', 'foliole-mdns-peer']]
  ]);
});

it('binds the isolated observer to its peer interface', () => {
  expect(resolveLinuxMdnsObserverOptions({}, ['--interface=192.0.2.2']))
    .toEqual({ interface: '192.0.2.2' });
  expect(resolveLinuxMdnsObserverOptions({ FOLIOLE_LINUX_MDNS_PEER_ADDRESS: '192.0.2.3' }))
    .toEqual({ interface: '192.0.2.3' });
  expect(() => resolveLinuxMdnsObserverOptions({})).toThrow('peer address is not configured');
});
