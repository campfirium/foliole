import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  assertAndroidResumeData, assertDesktopDepartureData
} from './multi-device-sync-participation-evidence.mjs';

const fail = (message) => new Error(message);

function snapshot(facts, counts = { attachments: 1, content_blobs: 5, nodes: 8 }) {
  return { database: { counts, inspection: { journeyFacts: facts }, integrity: 'ok' } };
}

describe('Android resume evidence', () => {
  it('uses a database-only device snapshot for participation facts', () => {
    const source = fs.readFileSync('scripts/sync-group/multi-device-sync-participation.mjs', 'utf8');
    expect(source).toContain('includeAttachments: false');
    expect(source).not.toContain('waitForAndroidJourneyFact');
    expect(source.match(/const after = await androidSnapshot/g)).toHaveLength(1);
  });

  it('leaves connected leaf A before hub B and the final Windows member', () => {
    const source = fs.readFileSync('scripts/sync-group/multi-device-sync-participation.mjs', 'utf8');
    expect(source.indexOf('android-post-resume-route-fact')).toBeLessThan(source.indexOf('await leaveMacos'));
    expect(source.indexOf('await leaveMacos')).toBeLessThan(source.indexOf('await leaveAndroid'));
    expect(source.indexOf("waitForProgress('macos-departure-observed')"))
      .toBeLessThan(source.indexOf('await leaveAndroid'));
    expect(source.indexOf('await leaveAndroid')).toBeLessThan(source.indexOf('await windows.finish'));
  });

  it('accepts exact fact convergence without requiring an incidental count delta', () => {
    expect(() => assertAndroidResumeData(
      snapshot({ existing: 'B' }), snapshot({ existing: 'B', resumed: 'A' }), 'resumed', fail
    )).not.toThrow();
  });

  it('rejects a missing resumed fact or loss of preexisting data', () => {
    expect(() => assertAndroidResumeData(
      snapshot({ existing: 'B' }), snapshot({ existing: 'B' }), 'resumed', fail
    )).toThrow(/Android did not retain resumed data/u);
    expect(() => assertAndroidResumeData(
      snapshot({ existing: 'B' }), snapshot({ resumed: 'A' }), 'resumed', fail
    )).toThrow(/Android did not retain resumed data/u);
  });
});

describe('desktop departure evidence', () => {
  const before = { activeMemberCount: 3, attachmentCount: 1, contentBlobCount: 4,
    deviceIdentity: 'desktop-a', userNodeCount: 5 };
  const after = { ...before, activeMemberCount: 2,
    departedAtByDeviceIdentity: { 'desktop-a': '2026-08-13T00:00:00Z' },
    localGroupId: null, localMemberState: null, syncDeliveryReceiptCount: 0, syncPeerCursorCount: 0 };
  const overview = { sync_enabled: false, sync_group: null };

  it('retains the surviving member facts after the local Device unbinds', () => {
    expect(() => assertDesktopDepartureData(before, after, overview, fail)).not.toThrow();
  });

  it('requires the local departure and cleared progress', () => {
    expect(() => assertDesktopDepartureData(before,
      { ...after, departedAtByDeviceIdentity: {}, syncPeerCursorCount: 1 }, overview, fail
    )).toThrow(/macOS departed state is incomplete/u);
  });
});
