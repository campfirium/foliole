/* global AbortSignal, console, fetch, TextDecoder */
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PLAY_PACKAGE, PLAY_TRACK, playAccessToken } from './play-api.mjs';
import { requireTrustedMobileRegistrar } from '../mobile/mobile-candidate-register.mjs';
import { createMobileGithubApi } from '../mobile/mobile-candidate-store.mjs';

const inventory = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/tracks/${PLAY_TRACK}/releases`;
const maxErrorBytes = 8192;
const reasons = new Map([
  ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'scope-insufficient'],
  ['SERVICE_DISABLED', 'api-disabled'],
  ['RATE_LIMIT_EXCEEDED', 'rate-limit'],
  ['QUOTA_EXCEEDED', 'quota'],
  ['rateLimitExceeded', 'rate-limit'],
  ['userRateLimitExceeded', 'rate-limit'],
  ['quotaExceeded', 'quota'],
  ['permissionDenied', 'permission-denied'],
  ['insufficientPermissions', 'permission-denied'],
]);

async function readSmallJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const bytes = new Uint8Array(maxErrorBytes);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
      if (value.length + length > bytes.length) return undefined;
      bytes.set(value, length);
      length += value.length;
    }
  } catch {
    return undefined;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function classifyForbidden(error) {
  // This exact message was observed in the previous 123-byte inventory failure.
  if (error?.code === 403 && error.status === 'PERMISSION_DENIED' &&
      error.message === 'Listing releases quota exceeded.') return 'listing-quota';
  const details = Array.isArray(error?.details) ? error.details : [];
  const legacy = Array.isArray(error?.errors) ? error.errors : [];
  const labels = new Set([
    ...details.filter(item => item?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
      item.domain === 'googleapis.com').map(item => reasons.get(item.reason)),
    ...legacy.filter(item => ['global', 'usageLimits', 'androidpublisher'].includes(item?.domain))
      .map(item => reasons.get(item.reason))
  ].filter(Boolean));
  if (labels.size === 1) return [...labels][0];
  if (labels.size > 1) return 'forbidden-unknown';
  return error?.code === 403 && error.status === 'PERMISSION_DENIED' ? 'permission-denied' : 'forbidden-unknown';
}

export async function diagnoseBetaInventory(token, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(inventory, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${token}` }
    });
  } catch {
    return 'inventory-request-failed';
  }
  if (response.status === 403) return classifyForbidden((await readSmallJson(response))?.error);
  await response.body?.cancel().catch(() => {});
  if (response.ok) return 'inventory-accessible';
  if (response.status === 401) return 'inventory-unauthorized';
  if (response.status === 429) return 'rate-limit';
  return 'inventory-http-error';
}

async function run(env) {
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (env.GITHUB_REF !== 'refs/heads/dev' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      headSha !== env.GITHUB_SHA) return 'untrusted-run';
  try {
    await requireTrustedMobileRegistrar({ api: createMobileGithubApi(env.GH_TOKEN), env, headSha });
  } catch { return 'untrusted-run'; }
  let token;
  try { token = await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON); }
  catch { return 'token-exchange-failed'; }
  return diagnoseBetaInventory(token);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const classification = await run(process.env).catch(() => 'diagnostic-failed');
  console.log(classification);
  if (classification !== 'inventory-accessible') process.exitCode = 1;
}
