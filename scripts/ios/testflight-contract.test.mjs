// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTestflightCandidate, verifyTestflightReceipt, IOS_APP_ID,
  IOS_GROUP_ID, IOS_INVITATION } from './testflight-candidate.mjs';
import { archiveArguments, testflightBuildEnv } from './testflight-archive.mjs';
import { verifyIosBundleMetadata } from './testflight-signature.mjs';
import { assertApprovedTestflightBuild, appleReadToken } from './testflight-publication.mjs';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, verify } from 'node:crypto';

const sha = 'a'.repeat(40);
const input = { headSha: sha, acceptedSha: sha, runSha: sha, ref: 'refs/heads/release',
  version: '0.7.18', packageVersion: '0.7.18', runId: '123456', buildNumber: '321.2', executionLane: 'release-t7' };
const candidate = createTestflightCandidate(input);
const receipt = { ...candidate, ipaSha256: 'b'.repeat(64), appId: IOS_APP_ID, groupId: IOS_GROUP_ID,
  invitationUrl: IOS_INVITATION, channel: 'testflight', buildId: 'build-123',
  externalBuildState: 'WAITING_FOR_BETA_REVIEW' };
function live(state = 'IN_BETA_TESTING') {
  return { data: { id: receipt.buildId, type: 'builds',
    attributes: { version: receipt.buildNumber, processingState: 'VALID', expired: false },
    relationships: { app: { data: { id: IOS_APP_ID, type: 'apps' } },
      preReleaseVersion: { data: { id: 'version', type: 'preReleaseVersions' } },
      buildBetaDetail: { data: { id: 'beta', type: 'buildBetaDetails' } },
      betaGroups: { data: [{ id: IOS_GROUP_ID, type: 'betaGroups' }] } } },
  included: [{ id: 'version', type: 'preReleaseVersions',
    attributes: { version: receipt.version, platform: 'IOS' } },
  { id: 'beta', type: 'buildBetaDetails', attributes: { externalBuildState: state, autoNotifyEnabled: true } }] };
}

describe('TestFlight exact candidate and public availability', () => {
  it('accepts the complete QA candidate only on its explicit distribution lane', () => {
    const qa = { ...input, executionLane: 'qa-mobile-beta', ref: 'refs/heads/check' };
    expect(createTestflightCandidate(qa)).toMatchObject({ sourceSha: sha, acceptedSha: sha });
    for (const change of [{ executionLane: 'dev-remote' }, { ref: 'refs/heads/dev' },
      { executionLane: 'release-t7' }, { acceptedSha: 'b'.repeat(40) }, { runSha: 'b'.repeat(40) }]) {
      expect(() => createTestflightCandidate({ ...qa, ...change })).toThrow();
    }
  });
  it('binds both targets to the accepted source and a unique workflow build', () => {
    expect(candidate.buildNumber).toBe('321.2');
    expect(createTestflightCandidate({ ...input, buildNumber: '322.1' }).buildNumber).toBe('322.1');
    for (const change of [{ acceptedSha: 'b'.repeat(40) }, { runSha: 'b'.repeat(40) },
      { packageVersion: '0.7.19' }, { ref: 'refs/heads/dev' }, { buildNumber: '10000.1' }, { buildNumber: undefined }, { executionLane: 'qa-mobile-beta' }]) {
      expect(() => createTestflightCandidate({ ...input, ...change })).toThrow();
    }
    const args = archiveArguments({ archive: 'a', derivedData: 'd', candidate, keyPath: 'key' });
    expect(args).toContain('MARKETING_VERSION=0.7.18');
    expect(args).toContain('CURRENT_PROJECT_VERSION=321.2');
    expect(args).toContain('CODE_SIGN_IDENTITY=Apple Distribution');
    expect(testflightBuildEnv({ KEEP: 'yes', FOLIOLE_DEV_LIVE_RELOAD: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1' })).toEqual({ KEEP: 'yes' });
  });

  it('requires a receipt for the exact release, destination, signed IPA and submitted review', () => {
    expect(verifyTestflightReceipt(receipt, { version: input.version, sha })).toBe(receipt);
    for (const change of [{ acceptedSha: 'b'.repeat(40) }, { ipaSha256: '' },
      { groupId: 'internal' }, { externalBuildState: 'READY_FOR_BETA_SUBMISSION' },
      { buildId: '../other' }, { invitationUrl: 'https://example.com' }]) {
      expect(() => verifyTestflightReceipt({ ...receipt, ...change })).toThrow();
    }
    expect(() => verifyTestflightReceipt(receipt, { sha: 'b'.repeat(40) })).toThrow();
  });

  it('requires App Store entitlements and matching host/extension versions', () => {
    for (const id of ['com.campfirium.foliole.ios', 'com.campfirium.foliole.ios.share']) {
      const info = { CFBundleIdentifier: id, CFBundleShortVersionString: input.version,
        CFBundleVersion: candidate.buildNumber };
      const entitlements = { 'application-identifier': `V589TQH334.${id}`,
        'com.apple.developer.team-identifier': 'V589TQH334', 'get-task-allow': false,
        'com.apple.security.application-groups': ['group.com.campfirium.foliole.ios.share'] };
      expect(() => verifyIosBundleMetadata(info, entitlements, candidate, id)).not.toThrow();
      expect(() => verifyIosBundleMetadata({ ...info, CFBundleVersion: '1' }, entitlements, candidate, id)).toThrow();
      expect(() => verifyIosBundleMetadata(info, { ...entitlements, 'get-task-allow': true }, candidate, id)).toThrow();
    }
  });

  it('does not publish pending review, expired, unassigned or different Apple builds', () => {
    expect(() => assertApprovedTestflightBuild(live(), receipt)).not.toThrow();
    for (const state of ['WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_REJECTED']) {
      expect(() => assertApprovedTestflightBuild(live(state), receipt)).toThrow(/not approved/);
    }
    for (const mutate of [r => { r.data.attributes.expired = true; },
      r => { r.data.id = 'other'; }, r => { r.data.relationships.betaGroups.data = []; },
      r => { r.included[1].attributes.autoNotifyEnabled = false; },
      r => { r.included[0].attributes.platform = 'MAC_OS'; }]) {
      const result = live(); mutate(result);
      expect(() => assertApprovedTestflightBuild(result, receipt)).toThrow();
    }
  });

  it('signs short-lived Apple API tokens using ES256', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    await expect(appleReadToken({ APPLE_API_KEY_ID: 'notary-key', APPLE_API_ISSUER: 'issuer',
      APPLE_NOTARY_API_KEY_BASE64: Buffer.from(pem).toString('base64') })).rejects.toThrow(/credentials/);
    const token = await appleReadToken({ IOS_APP_STORE_API_KEY_ID: 'test-key', IOS_APP_STORE_API_ISSUER: 'issuer',
      IOS_APP_STORE_API_KEY_BASE64: Buffer.from(pem).toString('base64') });
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    expect(claims.exp - claims.iat).toBe(300);
    expect(claims.aud).toBe('appstoreconnect-v1');
    expect(verify('sha256', Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  });
});
