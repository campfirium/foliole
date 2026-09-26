import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  browseCallback: null as null | ((event: Record<string, unknown>) => void),
  browseCancel: vi.fn(),
  resolveCallbacks: [] as Array<(event: Record<string, unknown>) => void>,
  resolveCancels: [] as Array<ReturnType<typeof vi.fn>>,
  resolveInputs: [] as unknown[]
}));

vi.mock('@foliole/desktop-dnssd', () => ({
  browse: (_input: unknown, callback: (event: Record<string, unknown>) => void) => {
    runtime.browseCallback = callback;
    return { cancel: runtime.browseCancel };
  },
  resolve: (input: unknown, callback: (event: Record<string, unknown>) => void) => {
    const cancel = vi.fn();
    runtime.resolveInputs.push(input);
    runtime.resolveCallbacks.push(callback);
    runtime.resolveCancels.push(cancel);
    return { cancel };
  }
}));

import { startDesktopDnsSdSession } from './desktopDnsSd.js';

const unresolved = {
  addresses: [], domain: 'local.', fqdn: 'Peer._foliole-sync._tcp.local.', host: '',
  interfaceIndex: 7, name: 'Peer', port: 0, txt: {}, type: '_foliole-sync._tcp'
};
const resolved = { ...unresolved, addresses: ['192.168.0.12'], host: 'peer.local.',
  port: 38641, txt: { group_id: 'group-1' } };

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  runtime.browseCallback = null;
  runtime.resolveCallbacks = [];
  runtime.resolveCancels = [];
  runtime.resolveInputs = [];
});

it('resolves system browse facts and projects found, changed, and lost', () => {
  const onService = vi.fn();
  const session = startDesktopDnsSdSession({ onError: vi.fn(), onService });
  runtime.browseCallback?.({ kind: 'found', service: unresolved });
  runtime.resolveCallbacks[0]?.({ kind: 'found', service: resolved });
  runtime.browseCallback?.({ kind: 'found', service: unresolved });
  runtime.resolveCallbacks[1]?.({ kind: 'found', service: { ...resolved, port: 38642 } });
  runtime.browseCallback?.({ kind: 'lost', service: unresolved });

  expect(runtime.resolveInputs).toEqual([{ domain: 'local.', interfaceIndex: 7,
    name: 'Peer', type: '_foliole-sync._tcp' }, { domain: 'local.', interfaceIndex: 7,
    name: 'Peer', type: '_foliole-sync._tcp' }]);
  expect(onService.mock.calls.map(([event]) => event.kind)).toEqual(['found', 'changed', 'lost']);
  session.stop();
});

it('fails closed on host errors and ignores callbacks after stop', () => {
  const onError = vi.fn();
  const onService = vi.fn();
  const session = startDesktopDnsSdSession({ onError, onService });
  runtime.browseCallback?.({ kind: 'found', service: unresolved });
  session.stop();
  runtime.resolveCallbacks[0]?.({ kind: 'found', service: resolved });
  runtime.browseCallback?.({ code: 'browse_failed', kind: 'error', message: 'offline' });

  expect(runtime.browseCancel).toHaveBeenCalledOnce();
  expect(runtime.resolveCancels[0]).toHaveBeenCalledOnce();
  expect(onService).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it('retries a failed service resolve without stopping discovery', () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const onService = vi.fn();
  startDesktopDnsSdSession({ onError, onService });
  runtime.browseCallback?.({ kind: 'found', service: unresolved });
  runtime.resolveCallbacks[0]?.({ code: 'resolve_failed', kind: 'error', message: 'offline' });
  vi.advanceTimersByTime(1_000);
  runtime.resolveCallbacks[1]?.({ kind: 'found', service: resolved });

  expect(onError).not.toHaveBeenCalled();
  expect(runtime.browseCancel).not.toHaveBeenCalled();
  expect(runtime.resolveInputs).toHaveLength(2);
  expect(onService).toHaveBeenCalledWith(expect.objectContaining({ kind: 'found' }));
});

it('surfaces a macOS local-network denial during resolve', () => {
  if (process.platform !== 'darwin') return;
  const onError = vi.fn();
  startDesktopDnsSdSession({ onError, onService: vi.fn() });
  runtime.browseCallback?.({ kind: 'found', service: unresolved });
  runtime.resolveCallbacks[0]?.({ code: 'desktop_dnssd_resolve_failed', kind: 'error', message: '-65570' });

  expect(onError).toHaveBeenCalledWith(new Error('desktop_dnssd_resolve_failed: -65570'));
  expect(runtime.browseCancel).toHaveBeenCalledOnce();
  expect(runtime.resolveCancels[0]).toHaveBeenCalledOnce();
});

it('cancels a pending resolve retry when the service is lost', () => {
  vi.useFakeTimers();
  const onService = vi.fn();
  startDesktopDnsSdSession({ onError: vi.fn(), onService });
  runtime.browseCallback?.({ kind: 'found', service: unresolved });
  runtime.resolveCallbacks[0]?.({ code: 'resolve_failed', kind: 'error', message: 'offline' });
  runtime.browseCallback?.({ kind: 'lost', service: unresolved });
  vi.advanceTimersByTime(1_000);

  expect(runtime.resolveInputs).toHaveLength(1);
  expect(onService).not.toHaveBeenCalled();
});
