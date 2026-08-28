import { IOS_HOSTED_DISCOVERY_TXT_KEYS } from '../../lib/platform/iosHostedSyncGroupContract.ts';
import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.ts';

type Discovery = {
  group_id: string;
  group_tag: string;
  protocol: Parameters<typeof serializeSyncProtocolTxt>[0];
  provider_device_id: string;
  runtime_instance_id: string;
};
type RegistrationEvent = {
  code?: string;
  kind: 'changed' | 'error' | 'found' | 'lost' | 'registered';
  message?: string;
  service?: { domain: string; name: string; port: number; txt: Record<string, string>; type: string };
};
type RegistrationHandle = { cancel(): void };
type Register = (input: HostedRegistrationInput, callback: (event: RegistrationEvent) => void) => RegistrationHandle;

export type HostedRegistrationInput = {
  domain: 'local.';
  name: string;
  port: number;
  txt: Record<string, string>;
  type: '_foliole-sync._tcp';
};

export function hostedRegistrationInput(discovery: Discovery, port: number) {
  const runtime = required(discovery.runtime_instance_id, 'runtime_instance_id');
  const input: HostedRegistrationInput = {
    domain: 'local.',
    name: `FolioleHosted-${runtime.replace(/[^A-Za-z0-9]/gu, '').slice(0, 32)}`,
    port,
    txt: {
      [IOS_HOSTED_DISCOVERY_TXT_KEYS.deviceId]: required(discovery.provider_device_id, 'provider_device_id'),
      [IOS_HOSTED_DISCOVERY_TXT_KEYS.groupId]: required(discovery.group_id, 'group_id'),
      [IOS_HOSTED_DISCOVERY_TXT_KEYS.groupTag]: required(discovery.group_tag, 'group_tag'),
      [IOS_HOSTED_DISCOVERY_TXT_KEYS.runtimeInstanceId]: runtime,
      ...serializeSyncProtocolTxt(discovery.protocol)
    },
    type: '_foliole-sync._tcp'
  };
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ios_hosted_registration_port_invalid');
  return input;
}

export function registerHostedProvider(
  register: Register, input: HostedRegistrationInput, onFailure: (error: Error) => void = () => {}
) {
  if (typeof register !== 'function') throw new Error('ios_hosted_native_registration_missing');
  let cancelled = false;
  let settled = false;
  let rejectReady: (error: Error) => void = () => {};
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const handle = register(input, (event) => {
    if (cancelled) return fail(new Error('ios_hosted_registration_callback_after_cancel'));
    if (event.kind === 'error') return fail(new Error(event.code ?? 'ios_hosted_registration_failed'));
    if (event.kind !== 'registered') return fail(new Error(`ios_hosted_registration_${event.kind}`));
    if (settled) return fail(new Error('ios_hosted_registration_duplicate_terminal'));
    if (event.service?.domain !== input.domain || event.service.name !== input.name ||
        event.service.port !== input.port || normalizeServiceType(event.service.type) !== input.type ||
        !txtMatches(event.service.txt, input.txt)) {
      return fail(new Error('ios_hosted_registration_identity_mismatch'));
    }
    settled = true;
    resolveReady();
  });
  function fail(error: Error) {
    rejectReady(error);
    onFailure(error);
  }
  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      handle.cancel();
    },
    ready
  };
}

function txtMatches(actual: Record<string, string> | undefined, expected: Record<string, string>) {
  return Boolean(actual && Object.entries(expected).every(([key, value]) => actual[key] === value));
}

function normalizeServiceType(value: string) {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

function required(value: string, field: string) {
  if (!value.trim()) throw new Error(`ios_hosted_${field}_missing`);
  return value.trim();
}
