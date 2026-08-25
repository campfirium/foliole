// @vitest-environment node

import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import {
  assertDebContents,
  assertLinuxAcceptanceHost,
  withLinuxMdnsAcceptanceInterface
} from './accept-linux-deb.mjs';
import {
  resolveLinuxMdnsObserverOptions,
  waitForObserverStart
} from './discover-foliole-mdns.mjs';

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

it('receives multicast on the shared port while routing the isolated peer interface', () => {
  expect(resolveLinuxMdnsObserverOptions({}, ['--interface=192.0.2.2']))
    .toEqual({ bind: '0.0.0.0', interface: '192.0.2.2' });
  expect(resolveLinuxMdnsObserverOptions({ FOLIOLE_LINUX_MDNS_PEER_ADDRESS: '192.0.2.3' }))
    .toEqual({ bind: '0.0.0.0', interface: '192.0.2.3' });
  expect(() => resolveLinuxMdnsObserverOptions({})).toThrow('peer address is not configured');
});

it('pauses controlled stdin after the observer start signal is consumed', async () => {
  const input = new PassThrough();
  const ready = vi.fn();
  const started = waitForObserverStart(['--controlled'], input, ready);

  input.write('discover\n');

  await expect(started).resolves.toBeUndefined();
  expect(ready).toHaveBeenCalledWith(JSON.stringify({ status: 'ready' }));
  expect(input.isPaused()).toBe(true);
});

it('times out and pauses a controlled observer that is never started', async () => {
  vi.useFakeTimers();
  const input = new PassThrough();
  const started = waitForObserverStart(['--controlled'], input, vi.fn());
  const rejected = expect(started).rejects.toThrow('observer was not started');

  await vi.advanceTimersByTimeAsync(10_000);

  await rejected;
  expect(input.isPaused()).toBe(true);
  vi.useRealTimers();
});
