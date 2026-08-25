// @vitest-environment node
/* global Buffer, process */

import { EventEmitter } from 'node:events';

import { expect, it } from 'vitest';

import {
  assertDebContents,
  assertLinuxAcceptanceHost,
  withLinuxMdnsAcceptanceInterface
} from './accept-linux-deb.mjs';
import {
  attachMdnsEvidence,
  resolveLinuxMdnsObserverOptions,
  summarizeMdnsPacket
} from './discover-foliole-mdns.mjs';
import { startControlledMdnsObserver } from '../../tests/desktop/harness/linuxMdnsDiscovery.ts';

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

it('preserves observable packet direction and record data in mDNS evidence', () => {
  const summary = summarizeMdnsPacket({
    additionals: [{ data: Buffer.from('v=1'), name: 'Foliole._foliole-sync._tcp.local', ttl: 120, type: 'TXT' }],
    answers: [], authorities: [], flags: 0, id: 0,
    questions: [{ name: '_foliole-sync._tcp.local', type: 'PTR' }], type: 'query'
  }, { address: '192.0.2.1', family: 'IPv4', port: 5353, size: 64 });

  expect(summary).toMatchObject({
    additionals: [{ data: { base64: 'dj0x' }, type: 'TXT' }],
    questions: [{ name: '_foliole-sync._tcp.local', type: 'PTR' }],
    source: { address: '192.0.2.1', port: 5353 }, type: 'query'
  });
});

it('records every mDNS event exposed by the observer library', () => {
  const mdns = new EventEmitter();
  const evidence = { packets: [], queries: [], responses: [], warnings: [] };
  const packet = { additionals: [], answers: [], authorities: [], questions: [], type: 'query' };
  const source = { address: '192.0.2.1', family: 'IPv4', port: 5353, size: 42 };
  attachMdnsEvidence(mdns, evidence, () => '2026-08-25T00:00:00.000Z');

  mdns.emit('packet', packet, source);
  mdns.emit('query', packet, source);
  mdns.emit('response', { ...packet, type: 'response' }, source);
  mdns.emit('warning', Object.assign(new Error('decode failed'), { code: 'EBADPACKET' }));

  expect(evidence).toMatchObject({
    packets: [{ type: 'query' }], queries: [{ type: 'query' }],
    responses: [{ type: 'response' }],
    warnings: [{ code: 'EBADPACKET', message: 'decode failed', name: 'Error' }]
  });
});

it('closes the control pipe so a spawned observer exits on discovery failure', async () => {
  const observerSource = `
    process.stdout.write(JSON.stringify({ status: 'ready' }) + '\\n');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => process.stdin.pause());
    process.stdin.once('end', () => {
      setTimeout(() => {
        console.error('Foliole mDNS service was not discovered');
        process.exitCode = 1;
      }, 25);
    });
    process.stdin.resume();
  `;
  const observer = startControlledMdnsObserver(process.execPath, ['--eval', observerSource]);

  await observer.ready;
  const startedAt = Date.now();

  await expect(observer.discover()).rejects.toThrow('Foliole mDNS service was not discovered');
  expect(Date.now() - startedAt).toBeLessThan(2_000);
}, 3_000);
