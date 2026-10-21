// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { hasWaitingSyncData, waitForAttachmentWorkYield } from '../../../../../lib/core/sync/attachmentWorkBudget.js';
import { createMemberSyncCadence } from '../../../../../lib/core/sync/memberSyncCadence.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract.js';
import { syncSessionReplySchema } from '../../../../../lib/platform/syncSessionContract.js';
import type { ForegroundSyncReason } from '../../../../companion/companionForegroundSyncRunner.js';
import { createCompanionRequestFixture, native } from '../../../../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../../../../test/companionSessionHttp.testSupport.js';

import { captureCompanionDesktopRound, closeCompanionDesktopSession, companionDesktopSessionTarget, ensureCompanionDesktopSession,
  subscribeCompanionDesktopChanges, waitForCompanionDesktopChanges } from './companionDesktopSession.js';
import { requestCompanionSyncSession } from './companionSyncSessionHttp.js';

// Native signing and HTTP/decryption run in Node; scheduling and data transfer use production TS.
vi.mock('./signedRequest.js', () => ({ createSignedRequestHeaders: async (input: {
  endpointUrl: string; method: string; pathWithQuery: string
}) => (await native.sign({ endpoint_url: input.endpointUrl, method: input.method,
  path_with_query: input.pathWithQuery, sync_group_id: 't326-group' })).headers }));

it('notifies queued desktop data while the previous round is still handling attachments', { meta: { calibratedMs: 60_000 } }, async () => {
  const { subscribeDesktopSyncCadence } = await import('../../../../companion/companionDesktopSyncCadence.js');
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let attachmentStarted = false;
  const active: { current: Promise<unknown> | null } = { current: null };
  const cadence = createMemberSyncCadence<ForegroundSyncReason>({
    holdPendingMutation: waitForAttachmentWorkYield,
    run: () => {
      active.current = mobile.sync({ onDatabaseConfirmed: captureCompanionDesktopRound(endpoint) });
      return active.current;
    }
  });
  let unsubscribe = () => {};
  let manual: Promise<unknown> | undefined;
  try {
    await mobile.fixture.right.seed({ nodeId: 'during-attachments', title: 'Text', content: 'First body' });
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    cadence.updateFreshness({ eligible: true, input: 'freshness' });
    native.post.mockImplementation(async input => {
      if (!attachmentStarted && new URL(input.url).searchParams.get('request') === 'attachments') {
        attachmentStarted = true;
        await blocked;
      }
      return mobile.post(input);
    });
    unsubscribe = subscribeDesktopSyncCadence(cadence);
    waitForCompanionDesktopChanges();
    manual = mobile.fixture.right.invoke('activation_manual');
    await vi.waitFor(() => expect(attachmentStarted).toBe(true), { timeout: 3000 });
    const baseVersionId = mobile.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id=?')
      .pluck().get('during-attachments');
    await mobile.fixture.right.invoke('local_content_edit', { nodeId: 'during-attachments', baseVersionId,
      versionId: 'during-attachments-next', content: 'New desktop body', hostName: 'Desktop',
      updatedAt: '2026-10-17T02:00:00Z' });
    await vi.waitFor(() => expect(hasWaitingSyncData()).toBe(true), { timeout: 1000 });
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('during-attachments'))
      .toBe('First body');
    release();
    await vi.waitFor(() => {
      expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('during-attachments'))
        .toBe('New desktop body');
    }, { timeout: 8000 });
  } finally {
    cadence.stop();
    unsubscribe();
    release();
    await active.current?.catch(() => undefined);
    await closeCompanionDesktopSession();
    await manual?.catch(() => undefined);
    await mobile.close();
  }
});

it('delivers an edit committed after final inventory but before finish, using the pre-round marker', { meta: { calibratedMs: 60_000 } }, async () => {
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  try {
    await mobile.fixture.right.seed({ nodeId: 'late-edit', title: 'Late edit', content: 'Before' });
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    const opened = syncSessionReplySchema.parse(JSON.parse((await native.http.mock.results[0]!.value).body));
    let injected = false;
    native.post.mockImplementation(async input => {
      if (!injected && new URL(input.url).searchParams.get('request') === 'round_finish') {
        injected = true;
        const row = mobile.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('late-edit');
        if (!row || typeof row !== 'object' || !('current_version_id' in row)) throw new Error('fixture_base_missing');
        await mobile.fixture.right.invoke('local_content_edit', { nodeId: 'late-edit',
          baseVersionId: row.current_version_id, versionId: 'late-desktop-version', content: 'After final inventory',
          hostName: 'Desktop', updatedAt: '2026-10-16T01:00:00Z' });
      }
      return mobile.post(input);
    });
    await mobile.sync();
    expect(injected).toBe(true);
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('late-edit')).toBe('Before');
    const reply = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, {
      operation: 'wait', session: opened.session, marker: opened.marker
    }));
    expect(reply.changed).toBe(true);
    await mobile.sync();
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('late-edit'))
      .toBe('After final inventory');
    const reopened = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, { operation: 'open' }));
    await expect(mobile.sync()).rejects.toThrow();
    await requestCompanionSyncSession(endpoint, { operation: 'close', session: reopened.session });
  } finally { await closeCompanionDesktopSession(); await mobile.close(); }
});

it('joins a desktop manual request to phone scheduling and persists concurrent changes without reverse HTTP', { meta: { calibratedMs: 60_000 } }, async () => {
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  let unsubscribe = () => {};
  try {
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    await mobile.sync();
    const before = await mobile.fixture.left.invoke('request_counts');
    await Promise.all([
      mobile.fixture.left.seed({ nodeId: 'phone-change', title: 'Phone', content: 'Phone body' }),
      mobile.fixture.right.seed({ nodeId: 'desktop-change', title: 'Desktop', content: 'Desktop body' })
    ]);
    unsubscribe = subscribeCompanionDesktopChanges(async () => {
      const complete = captureCompanionDesktopRound(endpoint);
      await mobile.sync();
      await complete();
    });
    waitForCompanionDesktopChanges();
    await expect(mobile.fixture.right.invoke('activation_manual')).resolves.toMatchObject({ status: 'completed' });
    expect(mobile.sqlite.prepare("SELECT id, content FROM nodes WHERE id IN ('phone-change', 'desktop-change') ORDER BY id").all())
      .toEqual([{ id: 'desktop-change', content: 'Desktop body' }, { id: 'phone-change', content: 'Phone body' }]);
    expect(await mobile.fixture.left.invoke('request_counts')).toEqual(before);
  } finally { unsubscribe(); await closeCompanionDesktopSession(); await mobile.close(); }
});

it('automatically pulls desktop changes while the phone waits and reconciles after reconnecting', { meta: { calibratedMs: 60_000 } }, async () => {
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  let unsubscribe = () => {};
  try {
    await mobile.fixture.right.seed({ nodeId: 'automatic-edit', title: 'Automatic', content: 'Before' });
    const target = { endpointUrl: endpoint, deviceId: mobile.fixture.rightSnapshot.deviceId, groupId: 't326-group',
      platform: 'darwin', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
    const binding = { target, libraryEpoch: `${target.deviceId}-epoch` };
    await ensureCompanionDesktopSession(endpoint, target.deviceId, binding);
    const requestsAfterOpen = native.http.mock.calls.length;
    await ensureCompanionDesktopSession(endpoint, target.deviceId, binding);
    expect(native.http.mock.calls.length).toBe(requestsAfterOpen);
    expect(companionDesktopSessionTarget('t326-group')).toEqual(target);
    await mobile.sync();
    const baseVersionId = mobile.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?')
      .pluck().get('automatic-edit');
    let delivered!: () => void;
    const received = new Promise<void>(resolve => { delivered = resolve; });
    unsubscribe = subscribeCompanionDesktopChanges(async () => { await mobile.sync(); delivered(); });
    waitForCompanionDesktopChanges();
    await mobile.fixture.right.invoke('local_content_edit', { nodeId: 'automatic-edit', baseVersionId,
      versionId: 'automatic-desktop-version', content: 'Delivered automatically', hostName: 'Desktop',
      updatedAt: '2026-10-16T02:00:00Z' });
    await received;
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('automatic-edit'))
      .toBe('Delivered automatically');
    await closeCompanionDesktopSession();
    expect(companionDesktopSessionTarget('t326-group')).toBeNull();
    await mobile.fixture.right.invoke('local_content_edit', { nodeId: 'automatic-edit',
      baseVersionId: 'automatic-desktop-version', versionId: 'offline-desktop-version', content: 'While disconnected',
      hostName: 'Desktop', updatedAt: '2026-10-16T02:01:00Z' });
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    await mobile.sync();
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('automatic-edit'))
      .toBe('While disconnected');
  } finally { unsubscribe(); await closeCompanionDesktopSession(); await mobile.close(); }
});

it('confirms desktop manual data synchronization before stalled attachments finish', { meta: { calibratedMs: 60_000 } }, async () => {
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let attachmentStarted = false;
  let manualResult: unknown;
  let unsubscribe = () => {};
  let sync: Promise<unknown> | undefined;
  try {
    await mobile.fixture.right.seed({ nodeId: 'confirm-before-attachments', title: 'Text', content: 'Persisted before attachments' });
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    native.post.mockImplementation(async input => {
      if (new URL(input.url).searchParams.get('request') === 'attachments') {
        attachmentStarted = true;
        await blocked;
        throw new Error('attachment_http_unavailable');
      }
      return mobile.post(input);
    });
    unsubscribe = subscribeCompanionDesktopChanges(async () => {
      const complete = captureCompanionDesktopRound(endpoint);
      sync = mobile.sync({ onDatabaseConfirmed: complete });
      await sync;
    });
    waitForCompanionDesktopChanges();
    const manual = mobile.fixture.right.invoke('activation_manual').then(result => { manualResult = result; });
    await vi.waitFor(() => {
      expect(attachmentStarted).toBe(true);
      expect(manualResult).toMatchObject({ status: 'completed' });
    }, { timeout: 3000 });
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('confirm-before-attachments'))
      .toBe('Persisted before attachments');
    release();
    await expect(sync).resolves.toMatchObject({ attachmentResourceError: 'attachment_http_unavailable',
      databaseConfirmedAt: expect.any(String) });
    await manual;
  } finally {
    release();
    await sync?.catch(() => undefined);
    unsubscribe();
    await closeCompanionDesktopSession();
    await mobile.close();
  }
});
