/* global Buffer, URLSearchParams, fetch */
// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { playAccessToken, createPlayApi, createPlayApkDownloader } from './play-api.mjs';

it('signs a real scoped service-account JWT and exchanges it only at the official token endpoint', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { type: 'service_account', client_email: 'upload@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
  const token = await playAccessToken(JSON.stringify(account), async (url, options) => {
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(options.redirect).toBe('error');
    const form = new URLSearchParams(options.body);
    const [header, payload, signature] = form.get('assertion').split('.');
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    const claim = JSON.parse(Buffer.from(payload, 'base64url'));
    expect(claim).toMatchObject({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token' });
    expect(claim.exp - claim.iat).toBe(3600);
    return { ok: true, json: async () => ({ access_token: 'temporary-token' }) };
  });
  expect(token).toBe('temporary-token');
  await expect(playAccessToken('{}')).rejects.toThrow(/dedicated/u);
  await expect(playAccessToken('bad JSON')).rejects.toThrow(/invalid/u);
  await expect(playAccessToken(JSON.stringify({ ...account, private_key: 'sensitive-invalid-key' })))
    .rejects.toThrow('Play service account private key is invalid');
});

it('downloads exact generated APK bytes using only a fixed authenticated GET and rejects failed reads', async () => {
  const received = [];
  const apk = Buffer.from([0x50, 0x4b, 3, 4, 0xff, 0, 1]);
  const server = createServer((request, response) => {
    received.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    response.end(apk);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const download = createPlayApkDownloader('temporary-token', (url, options) => {
      expect(options.redirect).toBe('error');
      return fetch(url.replace('https://androidpublisher.googleapis.com', `http://127.0.0.1:${server.address().port}`), options);
    });
    expect(await download(3, 'opaque/id+=')).toEqual(apk);
    expect(received).toEqual([{ method: 'GET', authorization: 'Bearer temporary-token',
      url: '/androidpublisher/v3/applications/com.campfirium.foliole.android/generatedApks/3/downloads/opaque%2Fid%2B%3D:download?alt=media' }]);
    await expect(download(0, 'id')).rejects.toThrow(/identity/u);
    await expect(download(3, '')).rejects.toThrow(/identity/u);
    const failed = createPlayApkDownloader('secret', async () => ({ ok: false, status: 403 }));
    await expect(failed(3, 'id')).rejects.toThrow('Play APK download failed (HTTP 403)');
    const lost = createPlayApkDownloader('secret', async () => { throw new Error('secret'); });
    await expect(lost(3, 'id')).rejects.toThrow('retry the same candidate without uploading');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

it('exercises production HTTP request serialization against an isolated Google boundary', async () => {
  const received = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ method: request.method, url: request.url, authorization: request.headers.authorization,
      type: request.headers['content-type'], body: Buffer.concat(chunks).toString() });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url.endsWith('/edits') ? { id: 'opaque-edit' } :
      { versionCode: 23, sha256: 'a'.repeat(64) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const api = createPlayApi('scoped-token', (url, options) => fetch(
      url.replace('https://androidpublisher.googleapis.com', `http://127.0.0.1:${address.port}`), options));
    await api('POST', 'edits', {});
    await api('POST', 'edits/123/bundles?uploadType=media', Buffer.from('signed-fixture'), true);
    await api('POST', 'edits/123:commit?changesNotSentForReview=false&changesInReviewBehavior=ERROR_IF_IN_REVIEW');
    expect(received.map(row => row.method)).toEqual(['POST', 'POST', 'POST']);
    expect(received[0]).toMatchObject({ authorization: 'Bearer scoped-token', body: '{}', type: 'application/json' });
    expect(received[1]).toMatchObject({ body: 'signed-fixture', type: 'application/octet-stream' });
    expect(received[1].url).toContain('/upload/androidpublisher/v3/applications/com.campfirium.foliole.android/');
    expect(received[2].url).toContain('changesInReviewBehavior=ERROR_IF_IN_REVIEW');
    expect(received[2].body).toBe('');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
