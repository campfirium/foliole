import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  advanceFriS220Stage, assertFriS220Converged, assertFriS220ResidueFree,
  createFriS220Attempt
} from './fri-s220-journey-contract.mjs';

const groupId = 'group-563c698c-b964-4c05-b273-c3d9c2c02995';
const attempt = createFriS220Attempt(groupId);
const baseline = { nodesById: {
  a: { content: 'Multi-device sync A fact', id: 'a', title: 'Multi-device sync A fact' },
  d: { id: 'd', reading: { lastHandledAt: 'old', repetitionCount: 0 },
    title: 'Multi-device sync D fact' }
} };

describe('Fri S220 deterministic journey contract', () => {
  it('derives stable markers only from the isolated group identity', () => {
    expect(attempt).toEqual({ attemptId: 'c3d9c2c02995',
      captureTitle: 'S220 Fri capture c3d9c2c02995',
      editMarker: 'S220 Fri edit c3d9c2c02995.', reviewTitle: 'Multi-device sync D fact',
      sourceTitle: 'Multi-device sync A fact' });
    expect(() => createFriS220Attempt('main')).toThrow('identity is invalid');
  });

  it('refuses an occupied attempt before the manual network window', () => {
    expect(assertFriS220ResidueFree(baseline, attempt)).toEqual({ reviewId: 'd',
      reviewReading: { lastHandledAt: 'old', repetitionCount: 0 }, sourceId: 'a' });
    expect(() => assertFriS220ResidueFree({ nodesById: { ...baseline.nodesById,
      residue: { id: 'residue', title: attempt.captureTitle } } }, attempt))
      .toThrow('already has isolated fixture residue');
  });

  it('requires one capture, one edit marker, and one completed review', () => {
    const converged = { nodesById: { ...baseline.nodesById,
      a: { ...baseline.nodesById.a, content: `body\n${attempt.editMarker}`,
        currentVersionId: 'version-a' },
      d: { ...baseline.nodesById.d,
        reading: { lastHandledAt: 'new', repetitionCount: 1 } },
      capture: { id: 'capture', title: attempt.captureTitle } },
    attemptPendingDeliveryCount: 0, conflicts: 0 };
    const before = { reviewReading: baseline.nodesById.d.reading, sourceVersionId: 'version-before' };
    expect(assertFriS220Converged(converged, attempt,
      `body\n${attempt.editMarker}`, before)).toMatchObject({
      captureId: 'capture', reading: { repetitionCount: 1 }, sourceVersionId: 'version-a'
    });
    expect(() => assertFriS220Converged(converged, attempt,
      `body\n${attempt.editMarker}\n${attempt.editMarker}`, before)).toThrow('exactly once');
  });

  it('keeps the physical test attempt bound to the injected group identity', () => {
    const source = fs.readFileSync('ios/App/AppPhysicalUITests/FoliolePhysicalOfflineJourneyUITests.swift', 'utf8');
    expect(source).toContain('requiredEnvironment("FOLIOLE_PHYSICAL_SYNC_GROUP_ID")');
    expect(source).not.toContain('private var s220AttemptId: String { "c3d9c2c02995" }');
    expect(source.indexOf('waitForExternalOfflineSignal()'))
      .toBeLessThan(source.indexOf('app.activate()'));
    expect(source.indexOf('app.activate()'))
      .toBeLessThan(source.indexOf('assertPublicSyncNowFailsOffline(in: app)'));
    expect(source.indexOf('assertPublicSyncNowFailsOffline(in: app)'))
      .toBeLessThan(source.indexOf('completeCachedReadingReview(in: app)'));
  });

  it('lets automatic Sync own online convergence without waiting for resource completion', () => {
    const source = fs.readFileSync(
      'ios/App/AppPhysicalUITests/FoliolePhysicalOfflineJourneyUITests.swift', 'utf8');
    const onlineBatch = source.slice(source.indexOf('func testS220OnlineBatchConvergesAfterSyncNow'),
      source.indexOf('private var s220AttemptId'));
    expect(onlineBatch).toContain('startS220OnlineConvergence(in: app)');
    expect(source).toContain('if s220AutomaticSyncIsRunning(in: app)');
    expect(source).toContain('s220-online-auto-sync-took-over');
    expect(source).toContain('syncNow.waitForExistence(timeout: 15)');
    expect(source).toContain('XCTAssertTrue(syncNow.isEnabled');
    expect(source).toContain('waitForSyncNowCompletion(in: app)');
    expect(source).toContain('The public Sync Now action explicitly failed.');
    expect(onlineBatch).toContain('allowingBackgroundSync: true');
    expect(source).toContain('tapButton(named: "Browse", in: app, timeout: 30)');
    expect(onlineBatch).not.toContain('tapEnabledButton(named: "Sync Now", in: app, timeout: 120)');
  });

  it('permits one offline and one online transition without retries', () => {
    expect(advanceFriS220Stage('prepared', 'offline_ready')).toBe('offline_ready');
    expect(advanceFriS220Stage('offline_complete', 'network_restored')).toBe('network_restored');
    expect(() => advanceFriS220Stage('offline_ready', 'network_restored'))
      .toThrow('not single-pass');
    expect(() => advanceFriS220Stage('offline_complete', 'offline_ready'))
      .toThrow('not single-pass');
  });
});
