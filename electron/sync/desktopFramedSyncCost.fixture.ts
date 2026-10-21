import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

/** Test-only HTTP accounting. No body buffering or production transport replacement. */
export function createSyncCostMeasurement() {
  const sockets = new Map<Socket, { read: number; written: number; active: number }>();
  const requests: { route: string; durationMs: number; receivedBytes: number;
    sentBytes: number; status: number; overlapping: boolean }[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let startingRss = 0;
  let peakRss = 0;
  let sampleCount = 0;
  let aborted = 0;
  const sample = () => { sampleCount++; peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  return {
    attach: (server: Server) => attachSockets(server, sockets),
    observe(request: IncomingMessage, response: ServerResponse) {
      const socket = sockets.get(request.socket);
      if (!timer || !socket) return;
      socket.active++;
      const overlapping = socket.active !== 1;
      const started = performance.now();
      let finished = false;
      response.once('finish', () => {
        finished = true;
        const route = new URL(request.url ?? '/', 'http://localhost');
        requests.push({ route: route.searchParams.get('request') ?? route.pathname,
          durationMs: performance.now() - started, status: response.statusCode,
          receivedBytes: request.socket.bytesRead - socket.read,
          sentBytes: request.socket.bytesWritten - socket.written,
          overlapping: overlapping || socket.active !== 1 });
        socket.read = request.socket.bytesRead;
        socket.written = request.socket.bytesWritten;
        socket.active--;
        sample();
      });
      response.once('close', () => { if (!finished) { aborted++; socket.active--; } });
    },
    start() {
      if (timer) throw new Error('sync_cost_measurement_already_running');
      requests.length = 0;
      aborted = 0;
      sampleCount = 0;
      startingRss = peakRss = process.memoryUsage().rss;
      for (const [socket, state] of sockets) {
        state.read = socket.bytesRead;
        state.written = socket.bytesWritten;
      }
      timer = setInterval(sample, 25);
      timer.unref();
      return { pid: process.pid, startingRss };
    },
    stop() {
      if (!timer) throw new Error('sync_cost_measurement_not_running');
      clearInterval(timer);
      timer = undefined;
      sample();
      return { pid: process.pid, startingRss, peakRss, endingRss: process.memoryUsage().rss,
        sampleCount, intervalMs: 25, aborted, requests: [...requests] };
    }
  };
}

function attachSockets(server: Server, sockets: Map<Socket, { read: number; written: number; active: number }>) {
  server.on('connection', socket => {
    sockets.set(socket, { read: 0, written: 0, active: 0 });
    socket.once('close', () => sockets.delete(socket));
  });
}
