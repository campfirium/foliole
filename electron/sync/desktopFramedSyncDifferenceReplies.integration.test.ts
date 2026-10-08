// @vitest-environment node
import { expect, it } from 'vitest';

import { projectFramedSyncDifferenceRequest } from '../../lib/core/sync/framedSyncDifferenceRequest.js';
import { compareFramedSyncInventories, type FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { encodeFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { readDesktopFramedSyncRoundInventory } from './desktopFramedSyncRoundInventory.js';
import { encodeDesktopFramedSyncSession } from './desktopFramedSyncSessionWire.js';
import { readFramedSyncStream } from './desktopFramedSyncStream.js';
import { readFramedSyncStreamSequence } from './desktopFramedSyncStreamSequence.js';
import { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

type Fixture = Awaited<ReturnType<typeof verifiedReceiverFixture>>;
const roundId = new Uint8Array(16).fill(4);
const context = { groupId: 'group', protocolVersion: 22 as const,
  initiatorDeviceId: 'receiver', initiatorLibraryEpoch: 'receiver-epoch',
  responderDeviceId: 'sender', responderLibraryEpoch: 'sender-epoch' };

async function differences(a: Fixture) {
  return compareFramedSyncInventories({ local: [], remote: await readDesktopFramedSyncRoundInventory(a.sender.db) });
}

async function request(a: Fixture, input: readonly FramedSyncInventoryDifference[]) {
  const body = await encodeDesktopFramedSyncSession({ authenticatedContext: context,
    groupKey: a.groupKey, noncePort: createDesktopFramedSyncSessionNoncePort(a.receiver.db),
    messages: input.map(difference => ({ payloadCase: 'difference_request' as const,
      payload: projectFramedSyncDifferenceRequest({ difference, roundId }).payload })) });
  return respondDesktopFramedSyncInventory({ context, db: a.sender.db, groupKey: a.groupKey,
    groupSecret: Buffer.from(a.groupKey).toString('base64url'), staging: a.staging,
    noncePort: createDesktopFramedSyncSessionNoncePort(a.sender.db),
    stream: await readFramedSyncStream(encodeFramedSyncHttpBody(body)) });
}

async function receivedUnits(body: Awaited<ReturnType<typeof request>>) {
  const units: number[][] = [];
  for await (const stream of readFramedSyncStreamSequence(encodeFramedSyncHttpBody(body))) {
    const frames: number[] = [];
    for await (const frame of stream.frames) frames.push(frame.header.frameType);
    units.push(frames);
  }
  return units;
}

it('returns two independent original authenticated transfer streams for two requests', async () => {
  const a = await verifiedReceiverFixture('First完整正文', 'first');
  const b = await verifiedReceiverFixture('Second😀正文', 'second', a.sender);
  try {
    expect(await receivedUnits(await request(a, await differences(a))))
      .toEqual([[2, 3, 4, 5], [2, 3, 4, 5]]);
    expect(a.sender.sqlite.prepare("SELECT count(*) FROM framed_sync_outbound_attempts WHERE state = 'replayable'").pluck().get())
      .toBe(2);
  } finally { b.close(); a.close(); }
});

it('validates a changed later source before preparing an earlier reply', async () => {
  const a = await verifiedReceiverFixture('First', 'first');
  const b = await verifiedReceiverFixture('Second', 'second', a.sender);
  try {
    const fresh = textBranch('fresh-version', 'Fresh');
    fresh.object_id = 'aaa-fresh'; fresh.snapshot.id = 'aaa-fresh';
    await a.sender.receive([fresh]);
    const selected = await differences(a);
    const first = selected.find(item => item.globalId === 'aaa-fresh')!;
    const second = selected.find(item => item.globalId === 'second')!;
    const baseline = a.sender.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get();
    await expect(request(a, [first, { ...second, sourceSnapshot: {
      ...second.sourceSnapshot, frontierFactIds: ['changed-version']
    } }])).rejects.toThrow('framed_sync_difference_request_source_changed');
    expect(a.sender.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(baseline);
  } finally { b.close(); a.close(); }
});

it('rejects duplicate request identities before preparing a response', async () => {
  const a = await verifiedReceiverFixture('First', 'first');
  try {
    const first = (await differences(a))[0]!;
    await expect(request(a, [first, first])).rejects.toThrow('framed_sync_difference_request_identity_duplicate');
  } finally { a.close(); }
});

it('keeps a first 1 MiB body as one original transfer and leaves the suffix for a later request', async () => {
  const a = await verifiedReceiverFixture('x'.repeat(1024 * 1024), 'first');
  const b = await verifiedReceiverFixture('Second', 'second', a.sender);
  try {
    const selected = await differences(a);
    expect(await receivedUnits(await request(a, selected))).toHaveLength(1);
    expect(await receivedUnits(await request(a, [selected[1]!]))).toEqual([[2, 3, 4, 5]]);
  } finally { b.close(); a.close(); }
});


it('returns a stable prefix when two sealed bodies exceed the 1 MiB target', async () => {
  const a = await verifiedReceiverFixture('a'.repeat(600 * 1024), 'first');
  const b = await verifiedReceiverFixture('b'.repeat(600 * 1024), 'second', a.sender);
  try {
    const selected = await differences(a);
    expect(await receivedUnits(await request(a, selected))).toHaveLength(1);
    expect(await receivedUnits(await request(a, [selected[1]!]))).toHaveLength(1);
    expect(a.sender.sqlite.prepare("SELECT count(*) FROM framed_sync_outbound_attempts WHERE state = 'replayable'").pluck().get())
      .toBe(2);
  } finally { b.close(); a.close(); }
});

it('rejects a 129-request session before producing a response', async () => {
  const a = await verifiedReceiverFixture('First', 'first');
  try {
    const first = (await differences(a))[0]!;
    await expect(request(a, Array.from({ length: 129 }, () => first)))
      .rejects.toThrow('framed_sync_difference_request_limit_exceeded');
  } finally { a.close(); }
});


it('packs a child requiring another object as its own original response unit', async () => {
  const a = await verifiedReceiverFixture('First', 'first');
  try {
    const parent = textBranch('parent-version', 'Parent');
    parent.object_id = 'zzz-parent'; parent.snapshot.id = 'zzz-parent'; parent.snapshot.kind = 'folder';
    await a.sender.receive([parent]);
    const child = textBranch('child-version', 'Child');
    child.object_id = 'middle-child'; child.snapshot.id = 'middle-child'; child.snapshot.parent_id = 'zzz-parent';
    await a.sender.receive([child]);
    const selected = (await differences(a)).filter(item => item.globalId !== 'zzz-parent');
    expect(selected.map(item => item.globalId)).toEqual(['first', 'middle-child']);
    expect(await receivedUnits(await request(a, selected))).toEqual([[2, 3, 4, 5], [2, 3, 4, 5]]);
    expect(await receivedUnits(await request(a, [selected[1]!]))).toHaveLength(1);
  } finally { a.close(); }
});
