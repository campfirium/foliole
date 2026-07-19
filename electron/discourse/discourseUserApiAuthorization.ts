import {
  constants,
  generateKeyPair,
  privateDecrypt,
  randomBytes,
  type KeyObject
} from 'node:crypto';
import { promisify } from 'node:util';

interface PendingAuthorization {
  createdAt: number;
  nonce: string;
  privateKey: KeyObject;
  siteUrl: string;
}

interface UserApiKeyPayload {
  key?: unknown;
  nonce?: unknown;
}

const generateRsaKeyPair = promisify(generateKeyPair);
const AUTHORIZATION_LIFETIME_MS = 15 * 60 * 1000;
let pendingAuthorization: PendingAuthorization | null = null;

function normalizeSiteUrl(value: string) {
  const url = new URL(value.trim().replace(/\/+$/g, ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Discourse authorization requires an HTTPS forum URL.');
  }
  return url.toString().replace(/\/+$/g, '');
}

function readUserApiKey(payload: UserApiKeyPayload, nonce: string) {
  if (payload.nonce !== nonce) throw new Error('Discourse authorization could not be verified.');
  if (typeof payload.key !== 'string' || !payload.key.trim() || /\s/u.test(payload.key)) {
    throw new Error('Discourse authorization did not include a valid User API key.');
  }
  return payload.key.trim();
}

export async function beginDiscourseUserApiAuthorization(siteUrl: string) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const { privateKey, publicKey } = await generateRsaKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { format: 'pem', type: 'spki' }
  });
  const nonce = randomBytes(16).toString('hex');
  pendingAuthorization = { createdAt: Date.now(), nonce, privateKey, siteUrl: normalizedSiteUrl };
  const url = new URL(`${normalizedSiteUrl}/user-api-key/new`);
  url.searchParams.set('application_name', 'Foliole');
  url.searchParams.set('client_id', randomBytes(16).toString('hex'));
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('padding', 'oaep');
  url.searchParams.set('public_key', publicKey);
  url.searchParams.set('scopes', 'read,write');
  return { authorization_url: url.toString() };
}

export function completeDiscourseUserApiAuthorization(siteUrl: string, encryptedPayload: string) {
  const pending = pendingAuthorization;
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  if (!pending || pending.siteUrl !== normalizedSiteUrl) {
    throw new Error('Generate a new Discourse authorization link first.');
  }
  if (Date.now() - pending.createdAt > AUTHORIZATION_LIFETIME_MS) {
    pendingAuthorization = null;
    throw new Error('The Discourse authorization has expired. Generate a new link.');
  }
  const decrypted = privateDecrypt({
    key: pending.privateKey,
    oaepHash: 'sha1',
    padding: constants.RSA_PKCS1_OAEP_PADDING
  }, Buffer.from(encryptedPayload.replace(/\s/gu, ''), 'base64'));
  const payload = JSON.parse(decrypted.toString('utf8')) as UserApiKeyPayload;
  const apiKey = readUserApiKey(payload, pending.nonce);
  pendingAuthorization = null;
  return apiKey;
}

export function resetDiscourseUserApiAuthorizationForTests() {
  pendingAuthorization = null;
}
