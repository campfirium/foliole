import {
  browse,
  resolve,
  type DesktopDnsSdEvent,
  type DesktopDnsSdHandle,
  type DesktopDnsSdService
} from '@foliole/desktop-dnssd';

const SERVICE = { domain: 'local.', type: '_foliole-sync._tcp' } as const;

export type DesktopDnsSdServiceChange = {
  kind: 'changed' | 'found' | 'lost';
  service: DesktopDnsSdService;
};

export interface DesktopDnsSdSession { stop(): void }

type SessionCallbacks = {
  onError: (error: Error) => void;
  onService: (event: DesktopDnsSdServiceChange) => void;
};
type ResolveToken = { handle: DesktopDnsSdHandle | null };
type SessionState = {
  browser: DesktopDnsSdHandle | null;
  callbacks: SessionCallbacks;
  pending: Map<string, ResolveToken>;
  resolved: Map<string, DesktopDnsSdService>;
  stopped: boolean;
};

function serviceKey(service: DesktopDnsSdService) {
  return `${service.interfaceIndex}:${service.fqdn || service.name}`;
}

function stopSession(state: SessionState) {
  if (state.stopped) return;
  state.stopped = true;
  state.browser?.cancel();
  state.pending.forEach(({ handle }) => handle?.cancel());
  state.pending.clear();
  state.resolved.clear();
}

function failSession(state: SessionState, event: Extract<DesktopDnsSdEvent, { kind: 'error' }>) {
  stopSession(state);
  state.callbacks.onError(new Error(`${event.code}: ${event.message}`));
}

function beginResolve(state: SessionState, service: DesktopDnsSdService) {
  const key = serviceKey(service);
  state.pending.get(key)?.handle?.cancel();
  const token: ResolveToken = { handle: null };
  state.pending.set(key, token);
  const handle = resolve({ ...SERVICE, interfaceIndex: service.interfaceIndex,
    name: service.name }, (event) => {
    if (state.stopped || state.pending.get(key) !== token) return;
    if (event.kind === 'error') {
      state.pending.delete(key);
      failSession(state, event);
      return;
    }
    if (event.kind !== 'found' && event.kind !== 'changed') return;
    state.pending.delete(key);
    const kind = state.resolved.has(key) ? 'changed' : 'found';
    state.resolved.set(key, event.service);
    state.callbacks.onService({ kind, service: event.service });
  });
  token.handle = handle;
  if (state.stopped) handle.cancel();
}

function consumeBrowseEvent(state: SessionState, event: DesktopDnsSdEvent) {
  if (state.stopped) return;
  if (event.kind === 'error') return failSession(state, event);
  if (event.kind === 'registered') return;
  const key = serviceKey(event.service);
  if (event.kind !== 'lost') return beginResolve(state, event.service);
  state.pending.get(key)?.handle?.cancel();
  state.pending.delete(key);
  const previous = state.resolved.get(key);
  state.resolved.delete(key);
  if (previous) state.callbacks.onService({ kind: 'lost', service: previous });
}

export function startDesktopDnsSdSession(callbacks: SessionCallbacks): DesktopDnsSdSession {
  const state: SessionState = {
    browser: null, callbacks, pending: new Map(), resolved: new Map(), stopped: false
  };
  state.browser = browse(SERVICE, (event) => consumeBrowseEvent(state, event));
  if (state.stopped) state.browser.cancel();
  return Object.freeze({ stop: () => stopSession(state) });
}
