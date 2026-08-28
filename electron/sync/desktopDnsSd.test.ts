import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  browse: vi.fn(),
  browseCallback: null as null | ((event: Record<string, unknown>) => void),
  register: vi.fn(),
  registerCallback: null as null | ((event: Record<string, unknown>) => void),
  stop: vi.fn()
}));

vi.mock('@foliole/desktop-dnssd', () => ({
  browse: (input: unknown, callback: (event: Record<string, unknown>) => void) => {
    native.browse(input);
    native.browseCallback = callback;
    return { stop: native.stop };
  },
  register: (input: unknown, callback: (event: Record<string, unknown>) => void) => {
    native.register(input);
    native.registerCallback = callback;
    return { stop: native.stop };
  }
}));

import { startDesktopDnsSdBrowse, startDesktopDnsSdRegistration } from './desktopDnsSd.js';

beforeEach(() => {
  vi.clearAllMocks();
  native.browseCallback = null;
  native.registerCallback = null;
});

function service(extra: Record<string, unknown> = {}) {
  return { addresses: ['192.168.0.12'], domain: 'local.', fqdn: 'F._foliole-sync._tcp.local.',
    host: 'F.local.', interfaceIndex: 7, name: 'F', port: 38641,
    txt: { group_id: 'g', group_tag: 't' }, type: '_foliole-sync._tcp', ...extra };
}

it('uses only the fixed Foliole service type and local domain', () => {
  startDesktopDnsSdBrowse(vi.fn());
  startDesktopDnsSdRegistration({ name: 'F', port: 38641, txt: { group_id: 'g' } }, vi.fn());
  expect(native.browse).toHaveBeenCalledWith({ domain: 'local.', type: '_foliole-sync._tcp' });
  expect(native.register).toHaveBeenCalledWith(expect.objectContaining({
    domain: 'local.', type: '_foliole-sync._tcp'
  }));
});

it('projects bounded found, changed, lost and registered events', () => {
  const browse = vi.fn();
  const registration = vi.fn();
  startDesktopDnsSdBrowse(browse);
  startDesktopDnsSdRegistration({ name: 'F', port: 38641, txt: {} }, registration);
  native.browseCallback?.({ kind: 'found', service: service() });
  native.browseCallback?.({ kind: 'changed', service: service({ port: 38642 }) });
  native.browseCallback?.({ kind: 'lost', service: service({ addresses: [], port: 0 }) });
  native.registerCallback?.({ kind: 'registered', service: service() });
  expect(browse.mock.calls.map(([event]) => event.kind)).toEqual(['found', 'changed', 'lost']);
  expect(registration).toHaveBeenCalledWith(expect.objectContaining({ kind: 'registered' }));
});

it('rejects malformed resolved facts before they enter HTTP routing', () => {
  const consume = vi.fn();
  startDesktopDnsSdBrowse(consume);
  native.browseCallback?.({ kind: 'found', service: service({ addresses: ['not-an-address'] }) });
  native.browseCallback?.({ kind: 'found', service: service({ port: 0 }) });
  expect(consume).toHaveBeenNthCalledWith(1, expect.objectContaining({
    code: 'desktop_dnssd_event_invalid', kind: 'error', message: 'desktop_dnssd_service_address_invalid'
  }));
  expect(consume).toHaveBeenNthCalledWith(2, expect.objectContaining({
    code: 'desktop_dnssd_event_invalid', kind: 'error', message: 'desktop_dnssd_service_port_invalid'
  }));
});

it('delegates repeated stop to the idempotent native handle', () => {
  const handle = startDesktopDnsSdBrowse(vi.fn());
  handle.stop();
  handle.stop();
  expect(native.stop).toHaveBeenCalledTimes(2);
});
