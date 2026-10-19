// @vitest-environment node
/* global AbortController */
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { get } from 'node:http';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it } from 'vitest';

import { createSyncChangeSessions } from '../../lib/core/sync/syncChangeSessions.ts';

import { closeProviderHttpServer, createProviderHttpServer } from './ios-sync-group-provider-http.ts';

it('finishes an active sync wait before closing the hosted HTTP listener', async () => {
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const opened = sessions.open('phone');
  const entered = Promise.withResolvers();
  const server = createProviderHttpServer(async (_request, response) => {
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

it('rejects new session requests on an existing connection during shutdown', async () => {
  const entered = Promise.withResolvers();
  let handled = 0;
  const server = createProviderHttpServer((_request, response) => {
    handled += 1;
    entered.resolve(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const socket = connect(server.address().port, '127.0.0.1');
  let wire = '';
  socket.on('data', chunk => { wire += String(chunk); });
  socket.write('GET /wait HTTP/1.1\r\nHost: localhost\r\n\r\n');
  const first = await entered.promise;
  const closing = closeProviderHttpServer(server, () => {});
  try {
    const request = once(server, 'request');
    socket.write('GET /open HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await request;
    expect(handled).toBe(1);
    const ended = once(socket, 'end');
    first.end('expired');
    await ended;
    await closing;
    expect(wire).toContain('503 Service Unavailable');
    expect(wire).toContain('provider_stopping');
  } finally {
    socket.destroy();
    server.closeAllConnections();
    await closing;
  }
});

it('closes a connection whose client has not completed HTTP headers', async () => {
  const accepted = Promise.withResolvers();
  const server = createProviderHttpServer((_request, response) => response.end('unexpected'));
  server.once('connection', accepted.resolve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const socket = connect(server.address().port, '127.0.0.1');
  await accepted.promise;
  socket.write('GET /companion/discovery HTTP/1.1\r\nHost: localhost\r\n');
  const closing = closeProviderHttpServer(server, () => {});
  try {
    expect(await Promise.race([closing.then(() => 'closed'), delay(500).then(() => 'pending')]))
      .toBe('closed');
  } finally {
    socket.destroy();
    await closing;
  }
});
