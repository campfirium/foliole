import {
  cloudflarePagesAssetHash,
  cloudflarePagesUploadBatches,
  prepareCloudflarePagesFiles,
  type CloudflarePagesUploadFile
} from './cloudflarePagesAssets.js';

const API = 'https://api.cloudflare.com/client/v4';
const DEPLOYMENT_POLL_INTERVAL_MS = 1_000;
const DEPLOYMENT_POLL_LIMIT = 90;

interface CloudflareEnvelope<T> {
  result?: T;
  success?: boolean;
}

interface CloudflarePagesProject {
  subdomain?: string;
}
interface CloudflarePagesDeployment {
  id?: string;
  latest_stage?: { status?: string };
  url?: string;
}
export type CloudflareProjectResolution =
  | { status: 'exists' }
  | { created: boolean; project: CloudflarePagesProject; status: 'ready' };

class CloudflareClientError extends Error {}

function headers(token: string, json = false) {
  return { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function readEnvelope<T>(response: Response, fallback: string) {
  let payload: CloudflareEnvelope<T>;
  try { payload = await response.json() as CloudflareEnvelope<T>; } catch { throw new Error(fallback); }
  if (!response.ok || payload.success === false || payload.result === undefined) {
    if (response.status === 401 || response.status === 403) {
      throw new CloudflareClientError('Cloudflare rejected the Account ID, authorization result, or required permissions.');
    }
    if (response.status >= 500) throw new CloudflareClientError('Cloudflare is temporarily unavailable.');
    throw new CloudflareClientError(`${fallback} (${response.status})`);
  }
  return payload.result;
}

function safeCloudflareError(error: unknown) {
  return error instanceof CloudflareClientError
    ? error
    : new CloudflareClientError("Couldn't reach Cloudflare. Check your connection and try again.");
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

export async function deleteCloudflarePagesProject(input: {
  accountId: string; projectName: string; token: string;
}) {
  try {
    const endpoint = `${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}`;
    const response = await fetch(endpoint, { headers: headers(input.token), method: 'DELETE' });
    if (response.status === 404) return;
    await readEnvelope<unknown>(response, 'Cloudflare Pages project deletion failed.');
  } catch (error) { throw safeCloudflareError(error); }
}

export async function resolveCloudflarePagesProject(input: {
  accountId: string; projectName: string; token: string;
}): Promise<CloudflareProjectResolution> {
  try {
    const endpoint = `${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}`;
    const current = await fetch(endpoint, { headers: headers(input.token) });
    if (current.ok) {
      await readEnvelope<CloudflarePagesProject>(current, 'Cloudflare Pages project lookup failed.');
      return { status: 'exists' };
    }
    if (current.status !== 404) await readEnvelope<CloudflarePagesProject>(current, 'Cloudflare Pages project lookup failed.');
    const created = await fetch(`${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects`, {
      body: JSON.stringify({ name: input.projectName, production_branch: 'main' }),
      headers: headers(input.token, true), method: 'POST'
    });
    if (created.status === 409) return { status: 'exists' };
    const project = await readEnvelope<CloudflarePagesProject>(created, 'Cloudflare Pages project creation failed.');
    return { created: true, project, status: 'ready' };
  } catch (error) { throw safeCloudflareError(error); }
}

async function getUploadToken(input: { accountId: string; projectName: string; token: string }) {
  const response = await fetch(`${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}/upload-token`, { headers: headers(input.token) });
  return (await readEnvelope<{ jwt: string }>(response, 'Cloudflare Pages upload authorization failed.')).jwt;
}

async function getMissingHashes(files: CloudflarePagesUploadFile[], jwt: string) {
  const response = await fetch(`${API}/pages/assets/check-missing`, {
    body: JSON.stringify({ hashes: files.map((file) => file.hash) }), headers: headers(jwt, true), method: 'POST'
  });
  return readEnvelope<string[]>(response, 'Cloudflare Pages asset check failed.');
}

async function uploadAssets(files: CloudflarePagesUploadFile[], jwt: string) {
  for (const batch of cloudflarePagesUploadBatches(files)) {
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

async function createDeployment(input: { accountId: string; files: CloudflarePagesUploadFile[]; projectName: string; token: string }) {
  const manifest = Object.fromEntries(input.files.map((file) => [`/${file.relativePath}`, file.hash]));
  const form = new FormData();
  form.append('branch', 'main');
  form.append('manifest', JSON.stringify(manifest));
  const response = await fetch(`${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}/deployments`, {
    body: form, headers: headers(input.token), method: 'POST'
  });
  return readEnvelope<CloudflarePagesDeployment>(response, 'Cloudflare Pages deployment failed.');
}

function acceptDeployment(deployment: CloudflarePagesDeployment) {
  const status = deployment.latest_stage?.status;
  if (status === 'failure' || status === 'canceled') {
    throw new CloudflareClientError('Cloudflare Pages deployment failed.');
  }
  return deployment;
}

async function readDeployment(input: { accountId: string; projectName: string; token: string }, id: string) {
  const endpoint = `${API}/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}/deployments/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { headers: headers(input.token) });
  return readEnvelope<CloudflarePagesDeployment>(response, 'Cloudflare Pages deployment status check failed.');
}

async function waitForDeployment(
  input: { accountId: string; projectName: string; token: string }, deployment: CloudflarePagesDeployment
) {
  acceptDeployment(deployment);
  if (deployment.latest_stage?.status === 'success') return deployment;
  if (!deployment.id) throw new CloudflareClientError('Cloudflare Pages did not return a deployment ID.');
  for (let attempt = 0; attempt < DEPLOYMENT_POLL_LIMIT; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS));
    const current = acceptDeployment(await readDeployment(input, deployment.id));
    if (current.latest_stage?.status === 'success') return current;
  }
  throw new CloudflareClientError('Cloudflare Pages deployment is still processing. Try again shortly.');
}

export async function deployCloudflarePages(input: {
  accountId: string; projectName: string; siteRoot: string; token: string;
}) {
  try {
    const files = prepareCloudflarePagesFiles(input.siteRoot);
    const jwt = await getUploadToken(input);
    const missing = new Set(await getMissingHashes(files, jwt));
    await uploadAssets(files.filter((file) => missing.has(file.hash)), jwt);
    const deployment = await createDeployment({ ...input, files });
    return await waitForDeployment(input, deployment);
  } catch (error) { throw safeCloudflareError(error); }
}

export { cloudflarePagesAssetHash };
