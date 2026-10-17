/* global setTimeout, clearTimeout, URL */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PREFIX = 'sync-timing-http:';

export async function openTimingReader(page) {
  const database = await page.evaluate(async () => {
    const sqlite = globalThis.Capacitor.Plugins.CapacitorSQLite;
    const { url } = await sqlite.getUrl({ database: 'foliole-companion', readonly: false });
    const databasePath = url.replace(/^file:\/\//u, '');
    if (!databasePath.includes('/com.campfirium.foliole.android.acceptance/')) {
      throw new Error('timing_reader_requires_isolated_application');
    }
    const version = await sqlite.query({ database: 'foliole-companion', readonly: false,
      statement: 'PRAGMA user_version', values: [] });
    await sqlite.createNCConnection({ databasePath, version: version.values[0].user_version });
    await sqlite.open({ database: databasePath, readonly: true });
    return databasePath;
  });
  return {
    read: nodeId => page.evaluate(async ({ database, nodeId }) => {
      const result = await globalThis.Capacitor.Plugins.CapacitorSQLite.query({ database, readonly: true,
        statement: 'SELECT id, content, current_version_id, resource_references FROM nodes WHERE id = ?', values: [nodeId] });
      return result.values?.[0] ?? null;
    }, { database, nodeId }),
    close: () => page.evaluate(databasePath => globalThis.Capacitor.Plugins.CapacitorSQLite.closeNCConnection({ databasePath }), database)
  };
}

export async function waitForTimingBody(read, expected, { startedAt = Date.now(), limitMs = 5000, now = Date.now } = {}) {
  const deadline = startedAt + limitMs;
  while (now() <= deadline) {
    let timer;
    const fact = await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('sync_timing_deadline_exceeded')), Math.max(1, deadline - now()));
    })]).finally(() => clearTimeout(timer));
    const observedAt = now();
    if (fact?.content === expected && observedAt <= deadline) {
      assert.ok(fact.current_version_id, 'Persisted version is required');
      return { observedAt, elapsedMs: observedAt - startedAt, versionId: fact.current_version_id,
        bodySha256: createHash('sha256').update(fact.content).digest('hex'), body: fact.content };
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('sync_timing_deadline_exceeded');
}

export async function observeTimingAttachments(page) {
  const requests = [];
  const listener = message => {
    if (!message.text().startsWith(PREFIX)) return;
    const event = JSON.parse(message.text().slice(PREFIX.length));
    if (event.phase === 'start') requests.push({ id: event.id, startedAt: Date.now() });
    else {
      const request = requests.find(value => value.id === event.id);
      if (request) Object.assign(request, { endedAt: Date.now(), bytes: event.bytes, failed: event.failed });
    }
  };
  page.on('console', listener);
  await page.evaluate(prefix => {
    const capacitor = globalThis.Capacitor;
    const original = capacitor.nativePromise;
    globalThis.__syncTimingOriginalNativePromise = original;
    capacitor.nativePromise = function(plugin, method, options, ...rest) {
      const tracked = plugin === 'FolioleCompanionSync' && method === 'postRequestSyncHttp'
        && new URL(options.url).searchParams.get('request') === 'attachments';
      if (!tracked) return original.call(this, plugin, method, options, ...rest);
      const id = options.request_id;
      globalThis.console.info(prefix + JSON.stringify({ phase: 'start', id }));
      return original.call(this, plugin, method, options, ...rest).then(result => {
        globalThis.console.info(prefix + JSON.stringify({ phase: 'end', id, bytes: result.response_byte_length }));
        return result;
      }, error => {
        globalThis.console.info(prefix + JSON.stringify({ phase: 'end', id, failed: true }));
        throw error;
      });
    };
  }, PREFIX);
  return { requests, close: async () => {
    try { await page.evaluate(() => {
      globalThis.Capacitor.nativePromise = globalThis.__syncTimingOriginalNativePromise;
      delete globalThis.__syncTimingOriginalNativePromise;
    }); } finally { page.off('console', listener); }
  } };
}

export function assertTimingOverlap(requests, startedAt) {
  const request = requests.find(value => value.startedAt <= startedAt && value.endedAt > startedAt
    && value.bytes >= 512 * 1024 && !value.failed);
  assert.ok(request, 'No completed attachment response of at least 512 KiB overlapped the edit');
  return request;
}
