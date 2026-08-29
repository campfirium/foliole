import os from 'node:os';

import {
  register,
  type DesktopDnsSdEvent,
  type DesktopDnsSdHandle
} from '@foliole/desktop-dnssd';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

import { logDesktopDnsSdDiagnostic } from './desktopDnsSdDiagnostics.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const REGISTRATION_TIMEOUT_MS = 5_000;
const SERVICE = { domain: 'local.', type: '_foliole-sync._tcp' } as const;

type ActiveAdvertisement = {
  finish: (error?: Error) => void;
  handle: DesktopDnsSdHandle;
  input: CompanionMdnsAdvertisementInput;
  lifecycle: number;
};

let activeAdvertisement: ActiveAdvertisement | null = null;
let factsRevision = 0;
let lifecycleRevision = 0;
let refreshQueue = Promise.resolve();

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  onWarning?: (error: unknown) => void;
  deviceId: string;
  port: number;
  groupDisplayName: string;
  groupId: string;
  groupTag: string;
}

function runtimeSuffix(runtimeInstanceId: string) {
  return runtimeInstanceId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 8) || 'runtime';
}

export function resolveCompanionMdnsIpv4Addresses(interfaces = os.networkInterfaces()) {
  return [...new Set(Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address))];
}

export function resolveCompanionMdnsServiceName(
  groupDisplayName: string, runtimeInstanceId: string, revision: number
) {
  const suffix = `${runtimeSuffix(runtimeInstanceId)}-r${revision.toString(36)}`;
  const displayLimit = Math.max(1, 62 - suffix.length);
  return `${Array.from(groupDisplayName).slice(0, displayLimit).join('')}-${suffix}`;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  stopCompanionMdnsAdvertisement();
  const registered = beginAdvertisement(input, lifecycleRevision);
  refreshQueue = registered.catch(() => undefined);
  return registered;
}

function registrationError(event: Extract<DesktopDnsSdEvent, { kind: 'error' }>) {
  return new Error(`${event.code}: ${event.message}`);
}

function beginAdvertisement(input: CompanionMdnsAdvertisementInput, lifecycle: number) {
  const runtimeId = loadSyncGroupRuntimeInstanceId();
  const addresses = resolveCompanionMdnsIpv4Addresses();
  const name = resolveCompanionMdnsServiceName(input.groupDisplayName, runtimeId, factsRevision);
  logDesktopDnsSdDiagnostic('register_started', {
    addresses, lifecycle, name, port: input.port, type: SERVICE.type
  });
  const registered = new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const handle = register({ ...SERVICE,
      name,
      port: input.port,
      txt: { app_version: input.appVersion, device_id: input.deviceId,
        facts_revision: String(factsRevision), group_id: input.groupId,
        group_tag: input.groupTag,
        ipv4_addresses: addresses.join(','),
        runtime_instance_id: runtimeId, ...serializeSyncProtocolTxt() }
    }, (event) => {
      if (lifecycle !== lifecycleRevision) return;
      logDesktopDnsSdDiagnostic('register_native_event', {
        eventKind: event.kind, lifecycle, name,
        ...(event.kind === 'error' ? { code: event.code } : {})
      });
      if (event.kind === 'error') {
        logDesktopDnsSdDiagnostic('register_error', {
          code: event.code, lifecycle, message: event.message, name
        });
        finish(registrationError(event));
      } else if (event.kind === 'registered') {
        logDesktopDnsSdDiagnostic('register_completed', { lifecycle, name, port: input.port });
        finish();
      }
    });
    activeAdvertisement = { finish, handle, input, lifecycle };
    timer = setTimeout(() => finish(new Error(
      'desktop_dnssd_registration_unavailable'
    )), REGISTRATION_TIMEOUT_MS);
  });
  return registered.catch((error) => {
    if (activeAdvertisement?.lifecycle === lifecycle) stopCompanionMdnsAdvertisement();
    input.onWarning?.(error);
    throw error;
  });
}

export function refreshCompanionMdnsAdvertisement() {
  factsRevision += 1;
  const targetLifecycle = activeAdvertisement?.lifecycle;
  refreshQueue = refreshQueue.then(() => {
    if (targetLifecycle === undefined
        || activeAdvertisement?.lifecycle !== targetLifecycle) return;
    const input = activeAdvertisement?.input;
    if (!input) return;
    stopCompanionMdnsAdvertisement();
    return beginAdvertisement(input, lifecycleRevision);
  });
  const refreshed = refreshQueue;
  refreshQueue = refreshed.catch(() => undefined);
  return refreshed;
}

export function stopCompanionMdnsAdvertisement() {
  lifecycleRevision += 1;
  if (activeAdvertisement) {
    logDesktopDnsSdDiagnostic('register_stopped', {
      lifecycle: activeAdvertisement.lifecycle
    });
  }
  activeAdvertisement?.finish(new Error('desktop_dnssd_registration_cancelled'));
  activeAdvertisement?.handle.cancel();
  activeAdvertisement = null;
}
