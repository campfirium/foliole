import http from 'node:http';
import { Transform } from 'node:stream';

// Diagnostic relay for the existing HTTP fixture; not a packet-level Wi-Fi model.
export async function slowNetworkRelay(origin: string, profile: { mbps: number; rttMs: number }, onLargeResponse?: () => void) {
  const metrics: { direction: string; bytes: number; pacingMs: number }[] = [];
  const server = http.createServer((request, response) => {
    const outgoing = http.request(new URL(request.url ?? '/', origin), {
      method: request.method, headers: request.headers
    }, incoming => {
      let received = 0;
      let notified = false;
      incoming.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (!notified && received > 65536) { notified = true; onLargeResponse?.(); }
      });
      response.writeHead(incoming.statusCode ?? 500, incoming.headers);
      incoming.pipe(pacer('response', profile, metrics)).pipe(response);
      incoming.on('error', error => response.destroy(error));
    });
    outgoing.on('error', error => response.destroy(error));
    request.pipe(pacer('request', profile, metrics)).pipe(outgoing);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('diagnostic_address_missing');
  return { url: `http://127.0.0.1:${address.port}`, metrics,
    close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

function pacer(direction: string, profile: { mbps: number; rttMs: number },
  metrics: { direction: string; bytes: number; pacingMs: number }[]) {
  const metric = { direction, bytes: 0, pacingMs: 0 };
  metrics.push(metric);
  let first = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const delay = chunk.length * 8 / (profile.mbps * 1000) + (first ? profile.rttMs / 2 : 0);
      first = false;
      metric.bytes += chunk.length;
      const start = performance.now();
      timer = setTimeout(() => {
        metric.pacingMs += performance.now() - start;
        callback(null, chunk);
      }, delay);
    },
    destroy(error, callback) { clearTimeout(timer); callback(error); }
  });
}
