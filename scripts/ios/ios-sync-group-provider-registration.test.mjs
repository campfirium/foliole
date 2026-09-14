import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.ts';
import { qualifyPreparedCompanionAnchorCandidate } from '../../src/shared/platform/companion/preparedAnchorDiscovery.ts';

import { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import {
  hostedRegistrationInput,
  registerHostedProvider
} from './ios-sync-group-provider-registration.ts';

const discovery = {
  group_id: 'group-t152-ios-runtime',
  group_tag: 'a'.repeat(32),
  protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  provider_device_id: 'ios-acceptance-contract-peer',
  provider_platform: 'macOS',
  runtime_instance_id: 'runtime-attempt-1',
  topology_role: 'anchor'
};

describe('iOS hosted provider OS DNS-SD registration', () => {
  it('publishes matching TXT and HTTP evidence for a desktop soft anchor', () => {
    const provider = createIosSyncGroupProviderContract({});
    const input = hostedRegistrationInput(provider.discovery, 43123);

    expect(qualifyPreparedCompanionAnchorCandidate({
      endpoint_url: 'http://hosted-provider.local:43123',
      http: provider.discovery,
      protocol_txt: input.txt
    })).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('binds production anchor identity to the dynamic listener port', async () => {
    const input = hostedRegistrationInput(discovery, 43123);
    const cancel = vi.fn();
    const register = vi.fn((actual, callback) => {
      callback({ kind: 'registered', service: {
        domain: actual.domain, name: actual.name, port: actual.port, txt: actual.txt, type: actual.type
      } });
      return { cancel };
    });
    const registration = registerHostedProvider(register, input);

    await expect(registration.ready).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'local.', port: 43123, type: '_foliole-sync._tcp'
    }), expect.any(Function));
    expect(input.txt).toMatchObject({
      device_id: discovery.provider_device_id,
      group_id: discovery.group_id,
      group_tag: discovery.group_tag,
      protocol_version: '5',
      provider_platform: 'macOS',
      runtime_instance_id: discovery.runtime_instance_id,
      topology_role: 'anchor'
    });
    registration.cancel();
    registration.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    ['wrong port', { kind: 'registered', service: { domain: 'local.', name: 'wrong', port: 43124,
      txt: hostedRegistrationInput(discovery, 43123).txt, type: '_foliole-sync._tcp' } }],
    ['lost', { kind: 'lost' }],
    ['host error', { code: 'register_failed', kind: 'error' }]
  ])('fails closed on %s', async (_label, event) => {
    const input = hostedRegistrationInput(discovery, 43123);
    const registration = registerHostedProvider((_actual, callback) => {
      callback(event);
      return { cancel: vi.fn() };
    }, input);
    await expect(registration.ready).rejects.toThrow();
  });

  it('reports callbacks delivered after idempotent cancellation', async () => {
    let callback = () => {};
    const failure = vi.fn();
    const input = hostedRegistrationInput(discovery, 43123);
    const registration = registerHostedProvider((_actual, next) => {
      callback = next;
      return { cancel: vi.fn() };
    }, input, failure);
    const rejected = expect(registration.ready).rejects
      .toThrow('ios_hosted_registration_callback_after_cancel');
    registration.cancel();
    callback({ kind: 'registered', service: {
      domain: input.domain, name: input.name, port: input.port, txt: input.txt, type: input.type
    } });
    await rejected;
    expect(failure).toHaveBeenCalledWith(expect.objectContaining({
      message: 'ios_hosted_registration_callback_after_cancel'
    }));
  });
});

it('rejects a missing native registrar and invalid dynamic port', () => {
  expect(() => registerHostedProvider(undefined, hostedRegistrationInput(discovery, 43123)))
    .toThrow('ios_hosted_native_registration_missing');
  expect(() => hostedRegistrationInput(discovery, 0)).toThrow('ios_hosted_registration_port_invalid');
});
