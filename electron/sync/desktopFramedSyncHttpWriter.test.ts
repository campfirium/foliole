// @vitest-environment node
import { Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES, FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';

import { writeDesktopFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';

it('keeps a payload held until its local write callback completes even when write returns true', async () => {
  const callbacks: Array<(error?: Error | null) => void> = [];
  const written: Buffer[] = [];
  const target = new Writable({ highWaterMark: 1024 * 1024,
    write(chunk: Buffer, _encoding, done) {
      written.push(Buffer.from(chunk));
      callbacks.push(done);
    }
  });
  let loaded = 0;
  let closed = false;
  async function* bytes() {
    try {
      for (const text of ['first', 'tail']) {
        loaded += 1;
        yield Buffer.from(text);
      }
    } finally { closed = true; }
  }
  const sending = writeDesktopFramedSyncHttpBody(target, bytes());
  await setImmediate();
  const held = loaded;
  while (!target.writableFinished) {
    callbacks.shift()?.();
    await setImmediate();
  }
  await sending;
  expect(held).toBe(1);
  expect(written.map((chunk) => chunk.toString())).toEqual(['first', 'tail']);
  expect(closed).toBe(true);
});

it('rejects a prematurely closed writable while its write callback is still outstanding', async () => {
  const target = new Writable({ write() {} });
  let closed = false;
  async function* bytes() {
    try { yield Buffer.from('payload'); }
    finally { closed = true; }
  }
  const sending = writeDesktopFramedSyncHttpBody(target, bytes());
  const result = expect(sending).rejects.toThrow('framed_sync_http_stream_closed');
  await setImmediate();
  target.destroy();
  await result;
  expect(closed).toBe(true);
});

it('drains an empty tail without waiting for an HTTP callback for zero bytes', async () => {
  const written: Buffer[] = [];
  const target = new Writable({ write(chunk: Buffer, _encoding, done) {
    written.push(Buffer.from(chunk));
    done();
  } });
  async function* bytes() { yield new Uint8Array(); yield Buffer.from('tail'); }
  await writeDesktopFramedSyncHttpBody(target, bytes());
  expect(written.map((chunk) => chunk.toString())).toEqual(['tail']);
  expect(target.writableFinished).toBe(true);
});

it('closes the producer and returns the original disk or socket error', async () => {
  const failure = new Error('socket_write_failed');
  let closed = false;
  let loaded = 0;
  const target = new Writable({
    write(_chunk, _encoding, done) { done(failure); }
  });
  async function* bytes() {
    try {
      for (let index = 0; index < 3; index += 1) {
        loaded += 1;
        yield Buffer.from('payload');
      }
    } finally { closed = true; }
  }
  await expect(writeDesktopFramedSyncHttpBody(target, bytes())).rejects.toBe(failure);
  expect(loaded).toBe(1);
  expect(closed).toBe(true);
  expect(target.destroyed).toBe(true);
});

it('holds frame capacity through slow write callbacks and prevents further source reads', async () => {
  const budget = new FramedSyncPayloadBudget();
  const held = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  const callbacks: Array<() => void> = [];
  const written: Buffer[] = [];
  let reads = 0;
  const shared = Buffer.alloc(4);
  async function* source() {
    for (let index = 1; index <= 3; index++) {
      reads++;
      shared.fill(index);
      yield shared;
    }
  }
  const target = new Writable({ write(chunk: Buffer, _encoding, done) {
    callbacks.push(() => { written.push(Buffer.from(chunk)); done(); });
  } });
  const sending = writeDesktopFramedSyncHttpBody(target, leaseFramedSyncPayloads(source(), budget, 'outbound'));
  await setImmediate();
  expect(reads).toBe(0);
  held.release();
  await setImmediate();
  expect(reads).toBe(1);
  let granted = false;
  const competitor = budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES })
    .then(lease => { granted = true; lease.release(); });
  await setImmediate();
  expect(granted).toBe(false);
  callbacks.shift()?.();
  await competitor;
  while (!target.writableFinished) {
    callbacks.shift()?.();
    await setImmediate();
  }
  await sending;
  expect(written).toEqual([Buffer.alloc(4, 1), Buffer.alloc(4, 2), Buffer.alloc(4, 3)]);
  budget.close(); await budget.drained;
});

it.each([false, true])('cancels a frame reservation without reading or leaving a waiter, granted=%s', async granted => {
  const budget = new FramedSyncPayloadBudget();
  const held = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  const controller = new AbortController();
  let reads = 0;
  async function* source() { reads++; yield Buffer.from('payload'); }
  const target = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const sending = writeDesktopFramedSyncHttpBody(target,
    leaseFramedSyncPayloads(source(), budget, 'outbound', undefined, controller.signal));
  const rejected = expect(sending).rejects.toThrow(/cancel|abort/iu);
  await setImmediate();
  if (granted) held.release();
  controller.abort();
  await rejected;
  expect(reads).toBe(0);
  held.release();
  const next = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  next.release(); budget.close(); await budget.drained;
});
