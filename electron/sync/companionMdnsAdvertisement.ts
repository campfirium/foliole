import os from 'node:os';

import {
  register,
  type DesktopDnsSdEvent,
  type DesktopDnsSdHandle
} from '@foliole/desktop-dnssd';

import type { DesktopAnchorRole } from '../../lib/platform/syncAnchorTopologyContract.js';
import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

import { logDesktopDnsSdDiagnostic } from './desktopDnsSdDiagnostics.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const REGISTRATION_TIMEOUT_MS = 5_000;
const RETRY_DELAYS_MS = [1_000, 3_000, 10_000] as const;
const STABLE_REGISTRATION_MS = 30_000;
const SERVICE = { domain: 'local.', type: '_foliole-sync._tcp' } as const;

type ActiveAdvertisement = {
  finish: (error?: Error) => void;
  handle: DesktopDnsSdHandle;
  input: CompanionMdnsAdvertisementInput;
  lifecycle: number;
};

let activeAdvertisement: ActiveAdvertisement | null = null;
let lifecycleRevision = 0;
let refreshQueue = Promise.resolve();
let retryFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stableTimer: ReturnType<typeof setTimeout> | null = null;
let desiredRole: DesktopAnchorRole | null = null;
let lastInput: CompanionMdnsAdvertisementInput | null = null;

export interface CompanionMdnsAdvertisementInput {
  appVersion: string;
  onWarning?: (error: unknown) => void;
  onRecovered?: () => void;
  deviceId: string;
  port: number;
  groupDisplayName: string;
  groupId: string;
  groupTag: string;
  role: DesktopAnchorRole;
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
  groupDisplayName: string, runtimeInstanceId: string, role: DesktopAnchorRole
) {
  const suffix = `${runtimeSuffix(runtimeInstanceId)}-${role}`;
  const displayLimit = Math.max(1, 62 - suffix.length);
  return `${Array.from(groupDisplayName).slice(0, displayLimit).join('')}-${suffix}`;
}

export function startCompanionMdnsAdvertisement(input: CompanionMdnsAdvertisementInput) {
  stopCompanionMdnsAdvertisement();
  desiredRole = input.role;
  lastInput = input;
  const registered = beginAdvertisement(input, lifecycleRevision);
  refreshQueue = registered.catch(() => undefined);
  return registered;
}

function registrationError(event: Extract<DesktopDnsSdEvent, { kind: 'error' }>) {
  return new Error(`${event.code}: ${event.message}`);
}

function registrationDetails(input: CompanionMdnsAdvertisementInput, runtimeId: string,
  addresses: string[], name: string) {
  return { ...SERVICE, name, port: input.port,
    txt: { app_version: input.appVersion, device_id: input.deviceId,
      group_id: input.groupId, group_tag: input.groupTag,
      ipv4_addresses: addresses.join(','), provider_platform: process.platform,
      runtime_instance_id: runtimeId, topology_role: input.role,
      ...serializeSyncProtocolTxt() } };
}

function beginAdvertisement(input: CompanionMdnsAdvertisementInput, lifecycle: number,
  recovering = false) {
  const runtimeId = loadSyncGroupRuntimeInstanceId();
  const addresses = resolveCompanionMdnsIpv4Addresses();
  const name = resolveCompanionMdnsServiceName(input.groupDisplayName, runtimeId, input.role);
  logDesktopDnsSdDiagnostic('register_started', {
    addresses, lifecycle, name, port: input.port, type: SERVICE.type
  });
  const registered = new Promise<void>((resolve, reject) => {
    let settled = false;
    let published = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const handle = register(registrationDetails(input, runtimeId, addresses, name), (event) => {
      if (lifecycle !== lifecycleRevision) return;
      logDesktopDnsSdDiagnostic('register_native_event', {
        eventKind: event.kind, lifecycle, name,
        ...(event.kind === 'error' ? { code: event.code } : {})
      });
      if (event.kind === 'error') {
        logDesktopDnsSdDiagnostic('register_error', {
          code: event.code, lifecycle, message: event.message, name
        });
        const error = registrationError(event);
        if (published) {
          stopCurrentAdvertisement();
          input.onWarning?.(error);
          scheduleRegistrationRetry(input);
        } else finish(error);
      } else if (event.kind === 'registered') {
        logDesktopDnsSdDiagnostic('register_completed', { lifecycle, name, port: input.port });
        published = true;
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
          if (activeAdvertisement?.lifecycle === lifecycle) retryFailures = 0;
        }, STABLE_REGISTRATION_MS);
        finish();
      }
    });
    activeAdvertisement = { finish, handle, input, lifecycle };
    timer = setTimeout(() => finish(new Error(
      'desktop_dnssd_registration_unavailable'
    )), REGISTRATION_TIMEOUT_MS);
  });
  return registered.catch((error) => {
    if (activeAdvertisement?.lifecycle === lifecycle) {
      if (recovering) stopCurrentAdvertisement();
      else stopCompanionMdnsAdvertisement();
    }
    input.onWarning?.(error);
    throw error;
  });
}

function stopCurrentAdvertisement() {
  lifecycleRevision += 1;
  if (activeAdvertisement) {
    logDesktopDnsSdDiagnostic('register_stopped', {
      lifecycle: activeAdvertisement.lifecycle
    });
  }
  if (stableTimer) clearTimeout(stableTimer);
  stableTimer = null;
  activeAdvertisement?.finish(new Error('desktop_dnssd_registration_cancelled'));
  activeAdvertisement?.handle.cancel();
  activeAdvertisement = null;
}

function scheduleRegistrationRetry(input: CompanionMdnsAdvertisementInput) {
  const delay = RETRY_DELAYS_MS[retryFailures++];
  if (delay === undefined) return;
  const revision = lifecycleRevision;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (revision !== lifecycleRevision || desiredRole === null) return;
    const next = { ...input, role: desiredRole };
    const recovered = beginAdvertisement(next, revision, true).then(() => {
      if (activeAdvertisement?.lifecycle === revision) next.onRecovered?.();
    })
      .catch(() => {
        if (desiredRole !== null) scheduleRegistrationRetry(next);
      });
    refreshQueue = recovered;
  }, delay);
}

export function updateCompanionMdnsAdvertisementRole(role: DesktopAnchorRole) {
  desiredRole = role;
  const targetLifecycle = activeAdvertisement?.lifecycle;
  refreshQueue = refreshQueue.then(() => {
    if (targetLifecycle === undefined
        || activeAdvertisement?.lifecycle !== targetLifecycle) return;
    const input = activeAdvertisement?.input;
    if (!input || input.role === desiredRole) return;
    stopCompanionMdnsAdvertisement();
    desiredRole = role;
    lastInput = { ...input, role };
    return beginAdvertisement(lastInput, lifecycleRevision);
  });
  const refreshed = refreshQueue;
  refreshQueue = refreshed.catch(() => undefined);
  return refreshed;
}

export function recoverCompanionMdnsAdvertisement() {
  if (activeAdvertisement || retryTimer || !lastInput || desiredRole === null) return;
  retryFailures = 0;
  scheduleRegistrationRetry(lastInput);
}

export function stopCompanionMdnsAdvertisement() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryFailures = 0;
  desiredRole = null;
  lastInput = null;
  stopCurrentAdvertisement();
}
