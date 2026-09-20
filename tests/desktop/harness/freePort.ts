import { createServer } from 'node:net';

export async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No free port.');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
