'use strict';
/* global clearTimeout, console, process, setTimeout */
const http = require('node:http');
const { resolve } = require('@foliole/desktop-dnssd');

const handles = [];
const server = http.createServer((_request, response) => response.end('ready'));
server.listen(0, '127.0.0.1', async () => {
  let timer;
  try {
    const started = Date.now();
    const reply = new Promise((accept, reject) => {
      const request = http.get(`http://127.0.0.1:${server.address().port}`, response => {
        response.resume();
        response.on('end', () => accept(Date.now() - started));
      });
      request.on('error', reject);
      timer = setTimeout(() => request.destroy(new Error('discovery response timed out')), 2_000);
    });
    for (let index = 0; index < 64; index += 1) {
      handles.push(resolve({ domain: 'local.', type: '_foliole-sync._tcp',
        name: `FolioleResponsiveness-${process.pid}-${index}` }, () => {}));
    }
    const elapsed = await reply;
    if (elapsed >= 2_000) throw new Error(`discovery response delayed ${elapsed}ms`);
    console.log(JSON.stringify({ elapsed, requests: handles.length }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    if (process.argv[2] !== 'environment-exit') {
      for (const handle of handles) handle.cancel();
    }
    server.close();
  }
});
