// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { createMemberSyncCadence } from '../../../../../lib/core/sync/memberSyncCadence.js';
import type { ForegroundSyncReason } from '../../../../companion/companionForegroundSyncRunner.js';
import { createCompanionRequestFixture, native } from '../../../../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../../../../test/companionSessionHttp.testSupport.js';

import { closeCompanionDesktopSession, companionDesktopSessionId, ensureCompanionDesktopSession,
  recoverCompanionDesktopRound, subscribeCompanionDesktopChanges } from './companionDesktopSession.js';

vi.mock('./signedRequest.js', () => ({ createSignedRequestHeaders: async (input: {
  endpointUrl: string; method: string; pathWithQuery: string
}) => (await native.sign({ endpoint_url: input.endpointUrl, method: input.method,
  path_with_query: input.pathWithQuery, sync_group_id: 't326-group' })).headers }));

it.each(['before-request', 'after-response', 'session-close'])('recovers the next data round when finish is lost %s', { meta: { calibratedMs: 60_000 } }, async loss => {
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  let dropped = false;
  const notified = vi.fn(async () => {});
  const unsubscribe = subscribeCompanionDesktopChanges(notified);
  const http = native.http.getMockImplementation()!;
  if (loss === 'session-close') native.http.mockImplementation(async input => {
    const operation = JSON.parse(new URL(input.url).searchParams.get('input')!).operation;
    if (operation === 'close') throw new Error('session close disconnected');
    return http(input);
  });
  try {
    await mobile.fixture.right.seed({ nodeId: 'before-lost-finish', title: 'Before', content: 'Already committed' });
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    const oldSession = companionDesktopSessionId(mobile.fixture.rightSnapshot.deviceId)!;
    native.post.mockImplementation(async input => {
      if (!dropped && new URL(input.url).searchParams.get('request') === 'round_finish') {
        dropped = true;
        if (loss === 'after-response') await mobile.post(input);
        throw new Error('unexpected end of stream');
      }
      return mobile.post(input);
    });
    await mobile.sync();
    expect(dropped).toBe(true);
    expect(notified).toHaveBeenCalledOnce();
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('before-lost-finish'))
      .toBe('Already committed');
    await mobile.fixture.right.seed({ nodeId: 'after-lost-finish', title: 'After', content: 'Next committed body' });
    await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
    const replacement = companionDesktopSessionId(mobile.fixture.rightSnapshot.deviceId);
    await recoverCompanionDesktopRound(mobile.fixture.rightSnapshot.deviceId, oldSession);
    expect(companionDesktopSessionId(mobile.fixture.rightSnapshot.deviceId)).toBe(replacement);
    expect(notified).toHaveBeenCalledOnce();
    await mobile.sync();
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('after-lost-finish'))
      .toBe('Next committed body');
  } finally { unsubscribe(); await closeCompanionDesktopSession(); await mobile.close(); }
});

it('automatically reconciles changes after an unconfirmed finish without another user edit', { meta: { calibratedMs: 60_000 } }, async () => {
  const { subscribeDesktopSyncCadence } = await import('../../../../companion/companionDesktopSyncCadence.js');
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const endpoint = mobile.fixture.rightSnapshot.origin;
  const active: { current: Promise<unknown> | null } = { current: null };
  const cadence = createMemberSyncCadence<ForegroundSyncReason>({ run: () => {
    active.current = (async () => {
      await ensureCompanionDesktopSession(endpoint, mobile.fixture.rightSnapshot.deviceId);
      return mobile.sync();
    })();
    return active.current;
  } });
  const unsubscribe = subscribeDesktopSyncCadence(cadence);
  let dropped = false;
  try {
    cadence.updateFreshness({ eligible: true, input: 'freshness' });
    native.post.mockImplementation(async input => {
      if (!dropped && new URL(input.url).searchParams.get('request') === 'round_finish') {
        dropped = true;
        await mobile.fixture.right.seed({ nodeId: 'after-finish-loss', title: 'Late', content: 'Needs a new round' });
        throw new Error('unexpected end of stream');
      }
      return mobile.post(input);
    });
    await cadence.requestImmediate('foreground');
    await vi.waitFor(() => {
      expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('after-finish-loss'))
        .toBe('Needs a new round');
    }, { timeout: 8000 });
  } finally {
    cadence.stop();
    unsubscribe();
    await active.current?.catch(() => undefined);
    await closeCompanionDesktopSession();
    await mobile.close();
  }
});
