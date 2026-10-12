// @vitest-environment node
/* global fetch */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

const { install } = createRequire(import.meta.url)('./sync-sqlite-wait-diagnostics.cjs');

it('keeps an HTTP request pending after headers until its body finishes', async () => {
  const records = [];
  const stop = install(record => records.push(record));
  let finish;
  const server = createServer((_request, response) => {
    response.writeHead(200); response.write('first');
    finish = () => response.end('last');
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/test?private=value`);
    expect(records).toContainEqual(expect.objectContaining({ event: 'http_start', path: '/test' }));
    expect(records).toContainEqual(expect.objectContaining({ event: 'http_headers', status: 200 }));
    expect(records.some(record => record.event === 'http_end')).toBe(false);
    finish();
    expect(await response.text()).toBe('firstlast');
    expect(records).toContainEqual(expect.objectContaining({ event: 'http_end', result: 'trailers' }));
  } finally { stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
