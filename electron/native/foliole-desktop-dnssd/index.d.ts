export interface DesktopDnsSdService {
  addresses: string[];
  domain: string;
  fqdn: string;
  host: string;
  interfaceIndex: number;
  name: string;
  port: number;
  txt: Record<string, string>;
  type: string;
}

export type DesktopDnsSdEvent =
  | { kind: 'registered'; service: DesktopDnsSdService }
  | { kind: 'found' | 'changed' | 'lost'; service: DesktopDnsSdService }
  | { code: string; kind: 'error'; message: string };

export interface DesktopDnsSdRegistrationInput {
  domain: 'local.';
  host?: string;
  name: string;
  port: number;
  txt: Record<string, string>;
  type: '_foliole-sync._tcp';
}

export interface DesktopDnsSdHandle {
  stop(): void;
}

export function browse(
  input: { domain: 'local.'; type: '_foliole-sync._tcp' },
  callback: (event: DesktopDnsSdEvent) => void
): DesktopDnsSdHandle;
export function register(
  input: DesktopDnsSdRegistrationInput,
  callback: (event: DesktopDnsSdEvent) => void
): DesktopDnsSdHandle;
