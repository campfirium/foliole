import { expect, it, vi } from 'vitest';

import { classifyResourceFailure, parseResourceClaims, parseResourceNeeds, resourceKey } from '../../platform/resourceAvailabilityContract.js';

import { observeResourceProviders, transferResourceProviders } from './resourceProviderPass.js';

const need = { kind: 'attachment' as const, id: 'a'.repeat(64) };
const key = resourceKey(need);
const providers = ['metadata', 'B', 'C'].map((deviceId) => ({ deviceId, endpointUrl: `http://${deviceId}` }));
const claim = { ...need, status: 'available' as const, sha256: need.id, size_bytes: 3 };
const query = async (provider: typeof providers[number]) => ({ provider_device_id: provider.deviceId,
  resources: [{ ...claim, status: provider.deviceId === 'metadata' ? 'missing' : 'available' }] });

it('requires complete bounded replies bound to the stable provider and content identity', () => {
  expect(() => parseResourceNeeds({ resources: Array(33).fill(need) })).toThrow();
  expect(() => parseResourceNeeds({ resources: [need, need] })).toThrow();
  expect(() => parseResourceNeeds({ resources: [{ ...need, id: '../file' }] })).toThrow();
  expect(() => parseResourceClaims({ provider_device_id: 'B', resources: [claim] }, 'C', [need])).toThrow(/identity/);
  expect(() => parseResourceClaims({ provider_device_id: 'C', resources: [] }, 'C', [need])).toThrow();
  expect(() => parseResourceClaims({ provider_device_id: 'C', resources: [claim], padding: 'x'.repeat(65_536) }, 'C', [need])).toThrow();
  expect(() => parseResourceClaims({ provider_device_id: 'C', resources: [claim], padding: '中'.repeat(22_000) }, 'C', [need])).toThrow();
  expect(() => parseResourceClaims({ provider_device_id: 'C', resources: [{ ...claim, sha256: 'b'.repeat(64) }] }, 'C', [need])).toThrow();
});

it('does not report malformed JSON or truncated multipart as a network outage', () => {
  expect(classifyResourceFailure(new SyntaxError('Unexpected token'))).toBe('protocol_error');
  expect(classifyResourceFailure(new Error('content_blob_batch_truncated'))).toBe('protocol_error');
  expect(classifyResourceFailure(new TypeError('fetch failed'))).toBe('network_error');
});

  it.each(['missing_file', 'checksum_mismatch', 'authentication_failed', 'network_error'] as const)(
    'retracts %s for B, retains its cause, and obtains C without requesting metadata-only A', async (error) => {
      const observed = await observeResourceProviders({ providers, needs: [need], query });
      const transfer = vi.fn(async (provider: typeof providers[number]) => provider.deviceId === 'B'
        ? { ready: [], errors: { [key]: error } } : { ready: [key], errors: {} });
      const result = await transferResourceProviders({ ...observed, needs: [need], transfer,
        eligibleDeviceIds: providers.map((provider) => provider.deviceId) });
      expect(transfer.mock.calls.map(([provider]) => provider.deviceId)).toEqual(['B', 'C']);
      expect(result.ready).toEqual([key]);
      expect(result.issues).toEqual([{ deviceId: 'B', resourceKey: key, error }]);
      expect(observed.observations.find((observation) => observation.provider.deviceId === 'B')?.claims).toEqual([]);
    });

  it('keeps offline or failed members unknown, without manufacturing a download target', async () => {
    const observed = await observeResourceProviders({ providers: [providers[0]!], needs: [need], query });
    const transfer = vi.fn();
    const result = await transferResourceProviders({ ...observed, needs: [need], transfer,
      eligibleDeviceIds: ['metadata', 'offline'] });
    expect(result.unresolvedState).toBe('unknown');
    expect(result.unresolved).toEqual([key]);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('never reuses expired claims or transfers to a removed member', async () => {
    const observed = await observeResourceProviders({ providers, needs: [need], query, now: () => 0 });
    const transfer = vi.fn();
    const result = await transferResourceProviders({ ...observed, needs: [need], transfer,
      eligibleDeviceIds: ['metadata'], now: () => 31_000 });
    expect(result.ready).toEqual([]);
    expect(transfer).not.toHaveBeenCalled();
    expect(result.unresolvedState).toBe('unknown');
  });

  it('refreshes an expired claim once and uses only the current answer', async () => {
    const observed = await observeResourceProviders({ providers: [providers[1]!], needs: [need], query, now: () => 0 });
    const refresh = vi.fn(async () => ({ provider_device_id: 'B', resources: [{ ...need, status: 'missing' }] }));
    const transfer = vi.fn();
    const result = await transferResourceProviders({ ...observed, needs: [need], transfer, refresh,
      eligibleDeviceIds: ['B'], now: () => 31_000 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(transfer).not.toHaveBeenCalled();
    expect(result.unresolvedState).toBe('no_declared_holder');
  });

  it('retains successful items when another item in the provider batch fails', async () => {
    const other = { ...need, id: 'b'.repeat(64) };
    const observed = await observeResourceProviders({ providers: [providers[1]!], needs: [need, other],
      query: async () => ({ provider_device_id: 'B', resources: [claim, { ...claim, ...other, sha256: other.id }] }) });
    const result = await transferResourceProviders({ ...observed, needs: [need, other], eligibleDeviceIds: ['B'],
      transfer: async () => ({ ready: [key], errors: { [resourceKey(other)]: 'checksum_mismatch' } }) });
    expect(result.ready).toEqual([key]);
    expect(result.unresolved).toEqual([resourceKey(other)]);
    expect(result.issues[0]?.error).toBe('checksum_mismatch');
  });

  it('treats a rejected encrypted claim as unknown and never transfers it', async () => {
    const observed = await observeResourceProviders({ providers, needs: [need], query: async () => {
      throw new Error('workgroup_aead_authentication_failed');
    } });
    expect(observed.issues.every((issue) => issue.error === 'authentication_failed')).toBe(true);
    const transfer = vi.fn();
    const result = await transferResourceProviders({ ...observed, needs: [need], transfer, eligibleDeviceIds: ['C'] });
    expect(result.unresolvedState).toBe('unknown');
    expect(transfer).not.toHaveBeenCalled();
  });
