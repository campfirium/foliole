// @vitest-environment node
/* global queueMicrotask */

import { expect, it, vi } from 'vitest';

import {
  waitForDesktopProductEvent, waitForDesktopProductState
} from './desktop-product-event.mjs';

it('waits on a bounded product event and reads state only after it fires', async () => {
  const page = { evaluate: vi.fn(async (callback, args) => {
    const previous = globalThis.electronAPI;
    globalThis.electronAPI = {
      invoke: vi.fn(async () => ({ join_requests: [{ request_id: 'request-1' }] })),
      onSyncGroupJoinRequestsChanged: (handler) => {
        queueMicrotask(handler);
        return () => undefined;
      }
    };
    try { return await callback(args); }
    finally { globalThis.electronAPI = previous; }
  }) };
  await expect(waitForDesktopProductEvent(page, 'onSyncGroupJoinRequestsChanged', {
    command: 'load_sync_group_overview', timeoutMs: 100
  })).resolves.toMatchObject({ join_requests: [{ request_id: 'request-1' }] });
});

it('subscribes before checking the current product state', async () => {
  const order = [];
  const page = { evaluate: vi.fn(async (callback, args) => {
    const previous = globalThis.electronAPI;
    globalThis.electronAPI = {
      invoke: async () => { order.push('load'); return { join_requests: [{ request_id: 'r' }] }; },
      onSyncGroupJoinRequestsChanged: () => { order.push('subscribe'); return () => undefined; }
    };
    try { return await callback(args); }
    finally { globalThis.electronAPI = previous; }
  }) };
  await waitForDesktopProductState(page, { command: 'load_sync_group_overview',
    condition: { count: 1, kind: 'join-request-count' },
    eventName: 'onSyncGroupJoinRequestsChanged', timeoutMs: 100 });
  expect(order).toEqual(['subscribe', 'load']);
});

it('rejects controller-defined event names', async () => {
  await expect(waitForDesktopProductEvent({}, 'onFakeReceiptChanged'))
    .rejects.toThrow('Unsupported desktop product event');
  await expect(waitForDesktopProductState({}, { eventName: 'onFakeReceiptChanged' }))
    .rejects.toThrow('Unsupported desktop product event');
});

it('waits for a product-visible sync conflict after an applied workspace event', async () => {
  const page = { evaluate: vi.fn(async (callback, args) => {
    const previous = globalThis.electronAPI;
    globalThis.electronAPI = { invoke: async () => [{ object_id: 'node-1' }],
      onWorkspaceSyncApplied: (handler) => { queueMicrotask(handler); return () => undefined; } };
    try { return await callback(args); }
    finally { globalThis.electronAPI = previous; }
  }) };
  await expect(waitForDesktopProductState(page, { command: 'load_sync_node_conflicts',
    commandArgs: { objectIds: ['node-1'] },
    condition: { count: 1, kind: 'sync-conflict-count' },
    eventName: 'onWorkspaceSyncApplied', timeoutMs: 100 })).resolves.toHaveLength(1);
});

it('subscribes before starting product discovery and matches the bound group', async () => {
  const order = [];
  const page = { evaluate: vi.fn(async (callback, args) => {
    const previous = globalThis.electronAPI;
    let handler;
    globalThis.electronAPI = {
      invoke: async (command) => {
        order.push(command);
        if (command === 'discover_sync_groups') queueMicrotask(handler);
        return command === 'load_sync_group_overview'
          ? { join_candidates: [{ group_id: 'group-bound', group_tag: 'a'.repeat(32) }] } : {};
      },
      onSyncGroupDiscoveryChanged: (next) => {
        order.push('subscribe'); handler = next; return () => undefined;
      }
    };
    try { return await callback(args); }
    finally { globalThis.electronAPI = previous; }
  }) };
  await waitForDesktopProductState(page, { command: 'load_sync_group_overview',
    condition: { groupId: 'group-bound', groupTag: 'a'.repeat(32), kind: 'candidate-identity' },
    eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 100,
    triggerCommand: 'discover_sync_groups' });
  expect(order.slice(0, 2)).toEqual(['subscribe', 'discover_sync_groups']);
});

it('rejects a discovery candidate when only one identity field matches', async () => {
  const page = { evaluate: vi.fn(async (callback, args) => {
    const previous = globalThis.electronAPI;
    globalThis.electronAPI = { invoke: async () => ({ join_candidates: [
      { group_id: 'group-bound', group_tag: 'b'.repeat(32) }
    ] }), onSyncGroupDiscoveryChanged: () => () => undefined };
    try { return await callback(args); }
    finally { globalThis.electronAPI = previous; }
  }) };
  await expect(waitForDesktopProductState(page, { command: 'load_sync_group_overview',
    condition: { groupId: 'group-bound', groupTag: 'a'.repeat(32), kind: 'candidate-identity' },
    eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 100 }))
    .rejects.toThrow('did not match id and tag');
});
