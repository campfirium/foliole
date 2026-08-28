import {
  browse,
  resolve,
  type DesktopDnsSdEvent,
  type DesktopDnsSdHandle,
  type DesktopDnsSdService
} from '@foliole/desktop-dnssd';

import { desktopDnsSdServiceFacts, logDesktopDnsSdDiagnostic } from './desktopDnsSdDiagnostics.js';

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
  sessionId: number;
};

let sessionRevision = 0;

function serviceKey(service: DesktopDnsSdService) {
  return `${service.interfaceIndex}:${service.fqdn || service.name}`;
}

function stopSession(state: SessionState) {
  if (state.stopped) return;
  state.stopped = true;
  logDesktopDnsSdDiagnostic('browse_stopped', { sessionId: state.sessionId });
  state.browser?.cancel();
  state.pending.forEach(({ handle }) => handle?.cancel());
  state.pending.clear();
  state.resolved.clear();
}

function failSession(state: SessionState, event: Extract<DesktopDnsSdEvent, { kind: 'error' }>) {
  logDesktopDnsSdDiagnostic('session_error', {
    code: event.code, message: event.message, sessionId: state.sessionId
  });
  stopSession(state);
  state.callbacks.onError(new Error(`${event.code}: ${event.message}`));
}

function beginResolve(state: SessionState, service: DesktopDnsSdService) {
  const key = serviceKey(service);
  state.pending.get(key)?.handle?.cancel();
  const token: ResolveToken = { handle: null };
  state.pending.set(key, token);
  logDesktopDnsSdDiagnostic('resolve_started', {
    fqdn: service.fqdn, interfaceIndex: service.interfaceIndex, sessionId: state.sessionId
  });
  const handle = resolve({ ...SERVICE, interfaceIndex: service.interfaceIndex,
    name: service.name }, (event) => {
    if (state.stopped || state.pending.get(key) !== token) return;
    if (event.kind === 'error') {
      state.pending.delete(key);
      failSession(state, event);
      return;
    }
    if (event.kind !== 'found' && event.kind !== 'changed') return;
    logDesktopDnsSdDiagnostic('resolve_completed', {
      ...desktopDnsSdServiceFacts(event.service), sessionId: state.sessionId
    });
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
  logDesktopDnsSdDiagnostic('browse_service', {
    eventKind: event.kind, ...desktopDnsSdServiceFacts(event.service),
    sessionId: state.sessionId
  });
  const key = serviceKey(event.service);
  if (event.kind !== 'lost') return beginResolve(state, event.service);
  state.pending.get(key)?.handle?.cancel();
  state.pending.delete(key);
  const previous = state.resolved.get(key);
  state.resolved.delete(key);
  if (previous) state.callbacks.onService({ kind: 'lost', service: previous });
}

export function startDesktopDnsSdSession(callbacks: SessionCallbacks): DesktopDnsSdSession {
  const sessionId = ++sessionRevision;
  const state: SessionState = {
    browser: null, callbacks, pending: new Map(), resolved: new Map(), sessionId, stopped: false
  };
  logDesktopDnsSdDiagnostic('browse_started', { domain: SERVICE.domain, sessionId,
    type: SERVICE.type });
  state.browser = browse(SERVICE, (event) => consumeBrowseEvent(state, event));
  if (state.stopped) state.browser.cancel();
  return Object.freeze({ stop: () => stopSession(state) });
}
