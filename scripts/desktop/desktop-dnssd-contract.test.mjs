// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const modulePath = path.resolve('electron/native/foliole-desktop-dnssd/index.cjs');

function fakeBackend() {
  const handles = [];
  const backend = {};
  for (const method of ['browse', 'register', 'resolve']) {
    backend[method] = vi.fn((_input, callback) => {
      const handle = { callback, cancel: vi.fn() };
      handles.push(handle);
      return handle;
    });
  }
  return { backend, handles };
}

describe('desktop DNS-SD capability', () => {
  it('exposes typed browse, resolve, register, and idempotent cancellation', () => {
    const { _createCapability } = require(modulePath);
    const { backend, handles } = fakeBackend();
    const capability = _createCapability(backend);
    const callback = vi.fn();
    const browse = capability.browse(
      { domain: 'local.', type: '_foliole-sync._tcp' }, callback);
    const resolve = capability.resolve(
      { domain: 'local.', name: 'Fixture', type: '_foliole-sync._tcp' }, callback);
    const register = capability.register({
      domain: 'local.', name: 'Fixture', port: 38649,
      txt: { group_id: 'fixture' }, type: '_foliole-sync._tcp'
    }, callback);

    browse.stop();
    browse.cancel();
    resolve.cancel();
    register.stop();

    expect(backend.browse).toHaveBeenCalledOnce();
    expect(backend.resolve).toHaveBeenCalledOnce();
    expect(backend.register).toHaveBeenCalledOnce();
    expect(handles.map(({ cancel }) => cancel.mock.calls.length)).toEqual([2, 1, 1]);
  });

  it('rejects malformed and unbounded input before reaching the host', () => {
    const { _createCapability, _validateTxt } = require(modulePath);
    const { backend } = fakeBackend();
    const capability = _createCapability(backend);
    const callback = vi.fn();
    const base = { domain: 'local.', type: '_foliole-sync._tcp' };

    expect(() => capability.register(
      { ...base, name: 'x'.repeat(64), port: 38649, txt: {} }, callback))
      .toThrow('desktop_dnssd_name_invalid');
    expect(() => capability.register(
      { ...base, name: 'Fixture', port: 0, txt: {} }, callback))
      .toThrow('desktop_dnssd_port_invalid');
    expect(() => capability.register({
      ...base, name: 'Fixture', port: 38649, txt: { key: 'x'.repeat(252) }
    }, callback)).toThrow('desktop_dnssd_txt_invalid');
    expect(() => capability.browse(
      { domain: 'example.', type: '_foliole-sync._tcp' }, callback))
      .toThrow('desktop_dnssd_service_contract_invalid');
    expect(() => _validateTxt({ device_id: 'x'.repeat(246) }))
      .toThrow('desktop_dnssd_txt_invalid');
    expect(backend.register).not.toHaveBeenCalled();
  });

  it('fails closed on malformed host output and ignores later events', () => {
    const { _createCapability } = require(modulePath);
    const { backend, handles } = fakeBackend();
    const callback = vi.fn();
    _createCapability(backend).browse(
      { domain: 'local.', type: '_foliole-sync._tcp' }, callback);

    handles[0].callback({ kind: 'found', service: { addresses: [] } });
    handles[0].callback({ code: 'late', kind: 'error', message: 'late' });

    expect(handles[0].cancel).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 'desktop_dnssd_host_event_invalid', kind: 'error'
    }));
  });

  it('delivers bounded found, changed, lost, and host error events', () => {
    const { _createCapability } = require(modulePath);
    const { backend, handles } = fakeBackend();
    const callback = vi.fn();
    _createCapability(backend).browse(
      { domain: 'local.', type: '_foliole-sync._tcp' }, callback);
    const service = {
      addresses: ['127.0.0.1'], domain: 'local.',
      fqdn: 'Fixture._foliole-sync._tcp.local.', host: 'fixture.local.',
      interfaceIndex: 1, name: 'Fixture', port: 38649,
      txt: { group_id: 'fixture' }, type: '_foliole-sync._tcp'
    };

    for (const kind of ['found', 'changed', 'lost']) {
      handles[0].callback({ kind, service });
    }
    handles[0].callback({ code: 'host_failed', kind: 'error', message: 'fixture' });

    expect(callback.mock.calls.map(([event]) => event.kind))
      .toEqual(['found', 'changed', 'lost', 'error']);
    expect(handles[0].cancel).not.toHaveBeenCalled();
  });

  it('statically cuts every desktop production discovery path to OS DNS-SD', () => {
    const roots = ['electron/main.ts', ...fs.readdirSync('electron/sync')
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => path.join('electron/sync', name))];
    const productionSource = roots.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

    expect(productionSource).toContain('@foliole/desktop-dnssd');
    expect(productionSource).not.toContain('bonjour-service');
    expect(productionSource).not.toContain('multicast-dns');
    expect(productionSource).not.toContain('maintainContinuousMdnsQuery');
  });

  it('keeps native DNS-SD out of the sandboxed preload and public IPC contract', () => {
    const preload = fs.readFileSync('electron/preload.cjs', 'utf8');
    const ipc = fs.readFileSync('electron/ipc/contracts.ts', 'utf8');

    expect(preload).not.toContain('desktop-dnssd');
    expect(preload).not.toContain('DNS-SD');
    expect(ipc).not.toContain('desktop-dnssd');
    expect(ipc).not.toContain('DNS-SD');
  });
});
