import fs from 'node:fs';
import path from 'node:path';

import { blake3 } from '@noble/hashes/blake3.js';

const API = 'https://api.cloudflare.com/client/v4';
const MAX_FILE_COUNT = 20_000;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_UPLOAD_BATCH_SIZE = 50 * 1024 * 1024;

interface CloudflareEnvelope<T> {
  errors?: Array<{ message?: string }>;
  result?: T;
  success?: boolean;
}

interface UploadFile {
  body: Buffer;
  contentType: string;
  hash: string;
  relativePath: string;
}

function headers(token: string, json = false) {
  return { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function readEnvelope<T>(response: Response, fallback: string) {
  let payload: CloudflareEnvelope<T>;
  try { payload = await response.json() as CloudflareEnvelope<T>; } catch { throw new Error(fallback); }
  if (!response.ok || payload.success === false || payload.result === undefined) {
    throw new Error(payload.errors?.[0]?.message || `${fallback} (${response.status})`);
  }
  return payload.result;
}

export function normalizeCloudflareProjectName(value: string) {
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/u.test(name)) {
    throw new Error('Use 1–58 lowercase letters, numbers, or hyphens for the Pages project name.');
  }
  return name;
}

export function normalizeSiteAddress(value: string) {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid HTTPS site address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Site address must be an HTTPS origin without a path.');
  }
  return url.origin;
}

export async function ensureCloudflarePagesProject(input: { accountId: string; projectName: string; token: string }) {
  const endpoint = `${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}`;
  const current = await fetch(endpoint, { headers: headers(input.token) });
  if (current.ok) return readEnvelope<{ subdomain?: string }>(current, 'Cloudflare Pages project lookup failed.');
  if (current.status !== 404) return readEnvelope<{ subdomain?: string }>(current, 'Cloudflare Pages project lookup failed.');
  const created = await fetch(`${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects`, {
    body: JSON.stringify({ name: input.projectName, production_branch: 'main' }),
    headers: headers(input.token, true), method: 'POST'
  });
  return readEnvelope<{ subdomain?: string }>(created, 'Cloudflare Pages project creation failed.');
}

function contentType(file: string) {
  const extension = path.extname(file).toLowerCase();
  return ({ '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/rss+xml' } as Record<string, string>)[extension]
    ?? 'application/octet-stream';
}

export function cloudflarePagesAssetHash(file: string, body: Buffer) {
  const extension = path.extname(file).slice(1);
  const input = Buffer.from(`${body.toString('base64')}${extension}`);
  return Buffer.from(blake3(Uint8Array.from(input))).toString('hex').slice(0, 32);
}

function listFiles(root: string, current = root): string[] {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, absolute) : [absolute];
  });
}

function prepareFiles(root: string) {
  const paths = listFiles(root);
  if (paths.length > MAX_FILE_COUNT) throw new Error('Cloudflare Pages deployments support at most 20,000 files.');
  return paths.map((file): UploadFile => {
    const body = fs.readFileSync(file);
    if (body.byteLength > MAX_FILE_SIZE) throw new Error(`Cloudflare Pages only supports files up to 25 MiB: ${path.basename(file)}`);
    return {
      body, contentType: contentType(file),
      hash: cloudflarePagesAssetHash(file, body),
      relativePath: path.relative(root, file).split(path.sep).join('/')
    };
  });
}

async function getUploadToken(input: { accountId: string; projectName: string; token: string }) {
  const response = await fetch(`${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}/upload-token`, { headers: headers(input.token) });
  return (await readEnvelope<{ jwt: string }>(response, 'Cloudflare Pages upload authorization failed.')).jwt;
}

async function getMissingHashes(files: UploadFile[], jwt: string) {
  const response = await fetch(`${API}/pages/assets/check-missing`, {
    body: JSON.stringify({ hashes: files.map((file) => file.hash) }), headers: headers(jwt, true), method: 'POST'
  });
  return readEnvelope<string[]>(response, 'Cloudflare Pages asset check failed.');
}

function uploadBatches(files: UploadFile[]) {
  const batches: UploadFile[][] = [];
  for (const file of files) {
    const current = batches.at(-1);
    const currentSize = current?.reduce((sum, item) => sum + item.body.byteLength, 0) ?? 0;
    if (!current || currentSize + file.body.byteLength > MAX_UPLOAD_BATCH_SIZE) batches.push([file]);
    else current.push(file);
  }
  return batches;
}

async function uploadAssets(files: UploadFile[], jwt: string) {
  for (const batch of uploadBatches(files)) {
    const body = batch.map((file) => ({
      base64: true, key: file.hash,
      metadata: { contentType: file.contentType }, value: file.body.toString('base64')
    }));
    const response = await fetch(`${API}/pages/assets/upload`, {
      body: JSON.stringify(body), headers: headers(jwt, true), method: 'POST'
    });
    await readEnvelope<unknown>(response, 'Cloudflare Pages asset upload failed.');
  }
}

async function createDeployment(input: { accountId: string; files: UploadFile[]; projectName: string; token: string }) {
  const manifest = Object.fromEntries(input.files.map((file) => [`/${file.relativePath}`, file.hash]));
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));
  const response = await fetch(`${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}/deployments`, {
    body: form, headers: headers(input.token), method: 'POST'
  });
  return readEnvelope<{ url?: string }>(response, 'Cloudflare Pages deployment failed.');
}

export async function deployCloudflarePages(input: { accountId: string; projectName: string; siteRoot: string; token: string }) {
  const files = prepareFiles(input.siteRoot);
  const jwt = await getUploadToken(input);
  const missing = new Set(await getMissingHashes(files, jwt));
  await uploadAssets(files.filter((file) => missing.has(file.hash)), jwt);
  return createDeployment({ ...input, files });
}
