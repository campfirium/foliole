export interface DesktopDnsSdService {
  addresses: string[];
  domain: string;
  fqdn: string;
  host: string;
  interfaceIndex: number;
  name: string;
  port: number;
  txt: Record<string, string>;
  type: '_foliole-sync._tcp';
}

export type DesktopDnsSdEvent =
  | { kind: 'registered'; service: DesktopDnsSdService }
  | { kind: 'found' | 'changed' | 'lost'; service: DesktopDnsSdService }
  | { code: string; kind: 'error'; message: string };

export interface DesktopDnsSdBaseInput {
  domain: 'local.';
  interfaceIndex?: number;
  type: '_foliole-sync._tcp';
}

export interface DesktopDnsSdRegistrationInput extends DesktopDnsSdBaseInput {
  host?: string;
  name: string;
  port: number;
  txt: Record<string, string>;
}

export interface DesktopDnsSdResolveInput extends DesktopDnsSdBaseInput {
  name: string;
}

export interface DesktopDnsSdHandle {
  cancel(): void;
  stop(): void;
}

export function browse(input: DesktopDnsSdBaseInput,
  callback: (event: DesktopDnsSdEvent) => void): DesktopDnsSdHandle;
export function register(input: DesktopDnsSdRegistrationInput,
  callback: (event: DesktopDnsSdEvent) => void): DesktopDnsSdHandle;
export function resolve(input: DesktopDnsSdResolveInput,
  callback: (event: DesktopDnsSdEvent) => void): DesktopDnsSdHandle;
