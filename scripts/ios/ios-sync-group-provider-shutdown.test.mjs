// @vitest-environment node
/* global AbortController */
import { randomUUID } from 'node:crypto';
import { createServer, get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it } from 'vitest';

import { createSyncChangeSessions } from '../../lib/core/sync/syncChangeSessions.ts';

import { closeProviderHttpServer } from './ios-sync-group-provider-http.ts';

it('finishes an active sync wait before closing the hosted HTTP listener', async () => {
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const opened = sessions.open('phone');
  const entered = Promise.withResolvers();
  const server = createServer(async (_request, response) => {
    const waiting = sessions.wait('phone', opened.session, opened.marker, new AbortController().signal);
    entered.resolve();
    try {
      await waiting;
      response.end('changed');
    } catch (error) {
      response.statusCode = 409;
      response.end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  const reply = new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${address.port}`, { agent: false }, response => {
      let body = '';
      response.on('data', chunk => { body += String(chunk); });
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
  await entered.promise;
  const closing = closeProviderHttpServer(server, () => sessions.closeAll());
  try {
    expect(await Promise.race([closing.then(() => 'closed'), delay(500).then(() => 'pending')]))
      .toBe('closed');
    expect(await reply).toBe('sync_session_expired');
    expect(sessions.hasSessions()).toBe(false);
  } finally {
    sessions.closeAll();
    await closing;
    await reply;
  }
});
