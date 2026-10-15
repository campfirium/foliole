import type {
  DesktopDnsSdEvent, DesktopDnsSdService, DesktopDnsSdHandle, DesktopDnsSdResolveInput
} from '@foliole/desktop-dnssd';

const browsers = new Set<(event: DesktopDnsSdEvent) => void>();
const services = new Map<string, DesktopDnsSdService>();

export function emitActivationService(kind: 'found' | 'lost', service: DesktopDnsSdService) {
  services.set(service.name, service);
  for (const callback of browsers) callback({ kind, service });
}

export function browse(_input: unknown, callback: (event: DesktopDnsSdEvent) => void): DesktopDnsSdHandle {
  browsers.add(callback);
  const cancel = () => { browsers.delete(callback); };
  return { cancel, stop: cancel };
}

export function resolve(input: DesktopDnsSdResolveInput, callback: (event: DesktopDnsSdEvent) => void) {
  let active = true;
  queueMicrotask(() => {
    const service = services.get(input.name);
    if (active && service) callback({ kind: 'found', service });
  });
  const cancel = () => { active = false; };
  return { cancel, stop: cancel };
}

export function register() {
  return { cancel() {}, stop() {} };
}
