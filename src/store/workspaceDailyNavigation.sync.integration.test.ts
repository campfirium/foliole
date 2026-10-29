// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, assertDurable, due, exchange, node, now, open, persistence, publish, setupPeers, settings, snapshot } from '../test/dailyFlowExceptions.testSupport';
import { legacyContinuation } from '../test/dailyFlowLegacyContinuation.testSupport';

afterEach(async () => { await closeLibraries(); });

it.each(['desktop', 'mobile'] as const)('legacy compatibility: selects from latest synchronized facts for the %s daily owner', async owner => {
  const peers = await setupPeers();
  const local = peers[owner === 'desktop' ? 0 : 1];
  const remote = peers[owner === 'desktop' ? 1 : 0];
  node(local, 'review', 'item');
  node(local, 'reading', 'topic');
  node(local, 'waiting', 'item');
  local.db.prepare("INSERT INTO node_review (node_id, due, scheduled_days) VALUES ('waiting', ?, 0)").run(due);
  let source = await open(local);
  expect(source.currentNodeId).toBe('review');
  source = await act(local, source, 'grade');
  source = await legacyContinuation(local.port, source, now);
  expect(source.currentNodeId).toBeNull();
  expect(source.continueNodeId).toBe('reading');
  await exchange(local, remote);
  node(remote, 'remote-review', 'item');
  const remoteSession = await openDailyFlow(remote.port, { now, mode: 'review-first' }, settings(remote), persistence);
  await act(remote, remoteSession.session, 'grade');
  await exchange(remote, local);
  expect((await readDailyFlow(local.port))!.invalidated).toBe(1);
  const synchronized = (await readDailyFlow(local.port))!.session;
  source = await legacyContinuation(local.port, { ...synchronized, currentNodeId: 'reading' }, now);
  const saved = await commitDailyFlow(local.port, { opId: `continue-${owner}`, now, token: source.daily!,
    navigation: 'continue-reading', expectedContinueNodeId: 'reading' }, settings(local), persistence);
  expect(saved.session.currentNodeId).toBe('reading');
  expect(saved.session.queueNodeIds).not.toContain('waiting');
  expect(saved).not.toHaveProperty('nodes');
  expect(saved.learning).toEqual({ reading: { reading: (await snapshot(local)).nodesById.reading!.reading, review: null } });
  expect(saved.session.reviewedItemCount).toBe(2);
  await assertDurable(local, saved.session);
  expect((await snapshot(local)).nodesById['remote-review']!.review).toEqual((await snapshot(remote)).nodesById['remote-review']!.review);
});

it.each([['desktop', 'delete'], ['desktop', 'read'], ['mobile', 'delete'], ['mobile', 'read']] as const)(
  'legacy compatibility: does not install a stale target on %s after synchronized %s', async (owner, action) => {
  const peers = await setupPeers();
  const local = peers[owner === 'desktop' ? 0 : 1];
  const remote = peers[owner === 'desktop' ? 1 : 0];
  node(local, 'review', 'item'); node(local, 'reading', 'topic'); node(local, 'other', 'topic');
  let source = await open(local);
  source = await act(local, source, 'grade');
  source = await legacyContinuation(local.port, source, now);
  const target = source.continueNodeId!;
  await exchange(local, remote);
  if (action === 'delete') {
    softDeleteNodes(remote.driver, { nodeIds: [target], deletedAt: due });
    publish(remote, target);
  } else {
    const session = (await openDailyFlow(remote.port, { now, mode: 'reading-only', preferredNodeId: target }, settings(remote), persistence)).session;
    await act(remote, session, 'read');
  }
  await exchange(remote, local);
  const saved = await commitDailyFlow(local.port, { opId: `stale-${owner}`, now, token: source.daily!,
    navigation: 'continue-reading', expectedContinueNodeId: target }, settings(local), persistence);
  expect(saved.session.currentNodeId).toBeNull();
  expect(saved.session.continueNodeId).toBeNull();
  expect(saved.session.completedAt).toBe(source.completedAt);
  expect(saved.session.queueNodeIds).not.toContain(target);
  expect(saved.session.reviewedItemCount).toBe(1);
  await assertDurable(local, saved.session);
  await exchange(local, remote);
  const a = await snapshot(local); const b = await snapshot(remote);
  expect(a.nodesById[target]?.reading).toEqual(b.nodesById[target]?.reading);
  expect(a.trashedNodeIds.includes(target)).toBe(b.trashedNodeIds.includes(target));
});

it('legacy compatibility: refuses mismatched targets, active currents and revision changes without writes', async () => {
  const [peer] = await setupPeers();
  node(peer, 'review', 'item'); node(peer, 'reading', 'topic');
  let source = await open(peer);
  const submit = (session: typeof source, target = 'reading') => commitDailyFlow(peer.port, {
    opId: crypto.randomUUID(), now, token: session.daily!, navigation: 'continue-reading', expectedContinueNodeId: target
  }, settings(peer), persistence);
  await expect(submit(source)).rejects.toThrow('daily_flow_changed');
  source = await act(peer, source, 'grade');
  source = await legacyContinuation(peer.port, source, now);
  await expect(submit(source, 'wrong')).rejects.toThrow('daily_flow_changed');
  const current = await openDailyFlow(peer.port, { now, mode: 'recommended', refresh: true }, settings(peer), persistence);
  const state = await readDailyFlow(peer.port);
  await expect(submit(source)).rejects.toThrow('daily_flow_changed');
  expect(await readDailyFlow(peer.port)).toEqual(state);
  expect(current.session.currentNodeId).toBe('reading');
});


it.each(['mode', 'unearned'] as const)('legacy compatibility: preserves completion when the explicit continuation is %s', async reason => {
  const [peer] = await setupPeers();
  node(peer, 'review', 'item'); node(peer, 'reading', 'topic');
  let source = await open(peer);
  source = await act(peer, source, 'grade');
  source = await legacyContinuation(peer.port, source, now);
  if (reason === 'mode') peer.db.exec("UPDATE daily_flow_state SET mode='review-first'");
  else peer.db.exec("UPDATE daily_flow_state SET session_json=json_set(session_json, '$.reviewedItemCount', 0)");
  const before = await readDailyFlow(peer.port);
  await expect(commitDailyFlow(peer.port, { opId: reason, now, token: source.daily!,
    navigation: 'continue-reading', expectedContinueNodeId: source.continueNodeId! }, settings(peer), persistence))
    .rejects.toThrow('daily_flow_changed');
  expect(await readDailyFlow(peer.port)).toEqual(before);
});

it.each([['desktop', 'delete'], ['desktop', 'read'], ['mobile', 'delete'], ['mobile', 'read']] as const)(
  'automatically advances the %s cycle and replaces an unavailable current after synchronized %s', async (owner, action) => {
    const peers = await setupPeers();
    const local = peers[owner === 'desktop' ? 0 : 1];
    const remote = peers[owner === 'desktop' ? 1 : 0];
    node(local, 'review', 'item'); node(local, 'reading', 'topic'); node(local, 'other', 'topic');
    let session = await open(local);
    expect(session.currentNodeId).toBe('review');
    session = await act(local, session, 'grade');
    expect(['reading', 'other']).toContain(session.currentNodeId);
    expect(session.continueNodeId).toBeNull();
    expect(session.cycle?.clearedAt).toBeTruthy();
    const target = session.currentNodeId!;
    await exchange(local, remote);
    if (action === 'delete') {
      softDeleteNodes(remote.driver, { nodeIds: [target], deletedAt: due });
      publish(remote, target);
    } else {
      const remoteSession = (await openDailyFlow(remote.port,
        { now, mode: 'reading-only', preferredNodeId: target }, settings(remote), persistence)).session;
      await act(remote, remoteSession, 'read');
    }
    await exchange(remote, local);
    session = await open(local);
    expect(session.currentNodeId).toBe(target === 'reading' ? 'other' : 'reading');
    expect(session.continueNodeId).toBeNull();
    expect(session.reviewedItemCount).toBe(1);
    await assertDurable(local, session);
    session = await act(local, session, 'soon');
    expect(session.currentNodeId).not.toBe(target);
    await assertDurable(local, session);
    await exchange(local, remote);
    const a = await snapshot(local); const b = await snapshot(remote);
    expect(a.nodesById[target]?.reading).toEqual(b.nodesById[target]?.reading);
    expect(a.trashedNodeIds.includes(target)).toBe(b.trashedNodeIds.includes(target));
    expect(a.nodesById.review!.review).toEqual(b.nodesById.review!.review);
  });
