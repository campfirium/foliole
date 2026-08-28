import { isIPv4 } from 'node:net';

import {
  browse,
  register,
  type DesktopDnsSdEvent as NativeEvent,
  type DesktopDnsSdHandle,
  type DesktopDnsSdRegistrationInput,
  type DesktopDnsSdService as NativeService
} from '@foliole/desktop-dnssd';

export const DESKTOP_SYNC_DNS_SD_DOMAIN = 'local.' as const;
export const DESKTOP_SYNC_DNS_SD_TYPE = '_foliole-sync._tcp' as const;

export type DesktopDnsSdService = {
  addresses: string[];
  domain: string;
  fqdn: string;
  host: string;
  interfaceIndex: number;
  name: string;
  port: number;
  txt: Record<string, string>;
  type: string;
};

export type DesktopDnsSdEvent =
  | { kind: 'changed' | 'found' | 'lost'; service: DesktopDnsSdService }
  | { code: string; kind: 'error'; message: string };
type DesktopDnsSdRegistrationEvent =
  | DesktopDnsSdEvent
  | { kind: 'registered'; service: DesktopDnsSdService };

export function startDesktopDnsSdBrowse(
  consume: (event: DesktopDnsSdEvent) => void
): DesktopDnsSdHandle {
  return browse({ domain: DESKTOP_SYNC_DNS_SD_DOMAIN, type: DESKTOP_SYNC_DNS_SD_TYPE },
    (event) => {
      const validated = safelyValidateEvent(event);
      if (validated.kind === 'registered') {
        consume({ code: 'desktop_dnssd_browse_event_invalid', kind: 'error',
          message: 'Registration event received by browse session.' });
      } else consume(validated);
    });
}

export function startDesktopDnsSdRegistration(
  input: Omit<DesktopDnsSdRegistrationInput, 'domain' | 'type'>,
  consume: (event: DesktopDnsSdRegistrationEvent) => void
): DesktopDnsSdHandle {
  return register({ ...input, domain: DESKTOP_SYNC_DNS_SD_DOMAIN, type: DESKTOP_SYNC_DNS_SD_TYPE },
    (event) => consume(safelyValidateEvent(event)));
}

function safelyValidateEvent(event: NativeEvent): DesktopDnsSdRegistrationEvent {
  try {
    return validateEvent(event);
  } catch (error) {
    return { code: 'desktop_dnssd_event_invalid', kind: 'error',
      message: error instanceof Error ? error.message : 'Invalid system DNS-SD event.' };
  }
}

function validateEvent(event: NativeEvent): DesktopDnsSdRegistrationEvent {
  if (event.kind === 'error') {
    return { code: bounded(event.code, 80), kind: 'error' as const,
      message: bounded(event.message, 500) };
  }
  return { kind: event.kind, service: validateService(event.service, event.kind === 'lost') };
}

function validateService(service: NativeService, lost: boolean): DesktopDnsSdService {
  const txtEntries = Object.entries(service.txt ?? {});
  if (txtEntries.length > 32 || txtEntries.some(([key, value]) =>
    !key || key.length > 63 || typeof value !== 'string'
    || Buffer.byteLength(`${key}=${value}`) > 255)) {
    throw new Error('desktop_dnssd_service_txt_invalid');
  }
  const port = Number(service.port);
  if (!lost && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('desktop_dnssd_service_port_invalid');
  }
  const addresses = [...new Set(service.addresses ?? [])];
  if (addresses.length > 16 || addresses.some((address) => !isIPv4(address))) {
    throw new Error('desktop_dnssd_service_address_invalid');
  }
  return {
    addresses,
    domain: bounded(service.domain, 255),
    fqdn: bounded(service.fqdn, 255),
    host: bounded(service.host, 255),
    interfaceIndex: Number.isInteger(service.interfaceIndex) ? service.interfaceIndex : 0,
    name: bounded(service.name, 63),
    port: lost ? 0 : port,
    txt: Object.fromEntries(txtEntries),
    type: bounded(service.type, 80)
  };
}

function bounded(value: unknown, limit: number) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > limit) {
    throw new Error('desktop_dnssd_service_text_invalid');
  }
  return value;
}
