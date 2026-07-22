// @vitest-environment node
import http from 'node:http';

import { afterEach, expect, it, vi } from 'vitest';

import { startDevScreenshotServer, stopDevScreenshotServer } from './devScreenshotServer.js';

function listen(server: http.Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected the test server to bind a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await stopDevScreenshotServer();
});

it('does not fail startup when the development screenshot port is occupied', async () => {
  const blocker = http.createServer();
  const port = await listen(blocker, 0);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  try {
    expect(() => startDevScreenshotServer({
      env: {
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600',
        FOLIOLE_DEV_SCREENSHOT_PORT: String(port),
        NODE_ENV: 'development'
      },
      getWindow: () => null
    })).not.toThrow();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(
      `[dev-screenshot] server unavailable reason=port-in-use port=${port}`
    ));
    expect(warn).not.toHaveBeenCalled();
  } finally {
    await close(blocker);
  }
});
