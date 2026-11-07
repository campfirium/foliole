/* global AbortSignal, console, fetch */
import process from 'node:process';
import { createHmac } from 'node:crypto';
import { appleReadToken } from './testflight-publication.mjs';
import { IOS_APP_ID } from './testflight-candidate.mjs';

const url = 'https://foliole-testflight-webhook.dolomitting.workers.dev/webhook';
const name = 'Foliole Website TestFlight Review';
const eventTypes = ['BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED'];

async function main() {
  if (process.env.GITHUB_REF !== 'refs/heads/dev' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Webhook configuration requires an explicit dev workflow dispatch.');
  }
  const secret = process.env.FOLIOLE_APPLE_WEBHOOK_SECRET;
  if (!/^[a-f0-9]{64}$/u.test(secret ?? '')) throw new Error('Missing the generated webhook signing secret.');
  const probe = JSON.stringify({ data: { type: 'buildBetaDetailExternalBuildStateUpdated' } });
  const signature = createHmac('sha256', secret).update(probe).digest('hex');
  const preflight = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), body: probe,
    headers: { 'content-type': 'application/json', 'x-apple-signature': `hmacsha256=${signature}` }
  });
  if (preflight.status !== 204) {
    const status = preflight.headers.get('x-foliole-github-status') ?? '';
    const detail = /^[1-5][0-9]{2}$/u.test(status) ? ` (GitHub HTTP ${status})` : '';
    throw new Error(`Webhook dispatch preflight returned HTTP ${preflight.status}${detail}.`);
  }
  const token = await appleReadToken();
  const request = async (route, method = 'GET', data) => {
    const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${route}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(data ? { body: JSON.stringify({ data }) } : {})
    });
    if (!response.ok) throw new Error(`Apple webhook ${method} returned HTTP ${response.status}.`);
    return response.status === 204 ? undefined : response.json();
  };
  const inventory = await request(`apps/${IOS_APP_ID}/webhooks?limit=200`);
  if (inventory.links?.next || !Array.isArray(inventory.data)) throw new Error('Incomplete Apple webhook inventory.');
  const matches = inventory.data.filter(row => row.attributes?.name === name || row.attributes?.url === url);
  if (matches.length > 1 || (matches.length === 1 &&
      (matches[0].attributes.name !== name || matches[0].attributes.url !== url))) {
    throw new Error('An existing Apple webhook conflicts with this endpoint.');
  }
  const attributes = { name, url, eventTypes, enabled: true, secret };
  const current = matches[0];
  const result = current
    ? await request(`webhooks/${current.id}`, 'PATCH', { type: 'webhooks', id: current.id, attributes })
    : await request('webhooks', 'POST', { type: 'webhooks', attributes,
      relationships: { app: { data: { type: 'apps', id: IOS_APP_ID } } } });
  const id = result?.data?.id;
  if (!id) throw new Error('Apple did not return the webhook identifier.');
  await request('webhookPings', 'POST', { type: 'webhookPings',
    relationships: { webhook: { data: { type: 'webhooks', id } } } });
  console.log(`Apple webhook ${id} enabled and test delivery requested.`);
}
await main();
