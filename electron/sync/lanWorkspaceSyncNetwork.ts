import os from 'node:os';

export function collectLanWorkspaceSyncUrls(port: number) {
  const externalUrls = Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
  return [...new Set([`http://127.0.0.1:${port}`, ...externalUrls])];
}
