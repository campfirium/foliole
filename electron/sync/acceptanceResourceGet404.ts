import { promises as fs } from 'node:fs';
import path from 'node:path';

type FaultConfig = { hash: string; library: string; markerRoot: string };

function faultConfig(env: NodeJS.ProcessEnv): FaultConfig | null {
  if (env.FOLIOLE_T203_RESOURCE_GET_404 !== '1') return null;
  const hash = env.FOLIOLE_T203_RESOURCE_GET_404_HASH ?? '';
  const library = env.FOLIOLE_T203_RESOURCE_GET_404_LIBRARY ?? '';
  const markerRoot = env.FOLIOLE_T203_RESOURCE_GET_404_EVIDENCE ?? '';
  if (!/^[a-f0-9]{64}$/u.test(hash) || !path.isAbsolute(library) ||
      path.basename(library) !== 'macos-library' ||
      !library.includes(`${path.sep}.tmp${path.sep}artifacts${path.sep}a5-single-principal-sync-group${path.sep}`) ||
      path.resolve(markerRoot) !== path.join(path.dirname(library), 't203-ios-provider-failover')) {
    throw new Error('T203 resource fault is outside its isolated acceptance library.');
  }
  return { hash, library, markerRoot };
}

export async function expireAvailableResourceForAcceptance(
  filePath: string, hash: string, sizeBytes: number, env: NodeJS.ProcessEnv = process.env
) {
  const config = faultConfig(env);
  if (!config || hash !== config.hash) return;
  const armed = path.join(config.markerRoot, 'arm-after-a5-presence');
  if (!await fs.access(armed).then(() => true, () => false)) return;
  const marker = path.join(config.markerRoot, 'available-then-removed.json');
  if (await fs.access(marker).then(() => true, () => false)) return;
  const [library, file] = await Promise.all([fs.realpath(config.library), fs.realpath(filePath)]);
  if (!file.startsWith(`${library}${path.sep}`) || path.basename(file) !== `${hash}.png`) {
    throw new Error('T203 resource fault target is not the owned image.');
  }
  await fs.unlink(file);
  await fs.writeFile(marker, `${JSON.stringify({ claimedStatus: 'available',
    contentHash: hash, filePath: file, removedAfterHashCheck: true, sizeBytes }, null, 2)}\n`);
}

export async function recordMissingResourceGetForAcceptance(
  attachmentId: string, contentHash: string, env: NodeJS.ProcessEnv = process.env
) {
  const config = faultConfig(env);
  if (!config || attachmentId !== config.hash || contentHash !== config.hash) return;
  const claimMarker = path.join(config.markerRoot, 'available-then-removed.json');
  if (!await fs.access(claimMarker).then(() => true, () => false)) return;
  await fs.writeFile(path.join(config.markerRoot, 'first-get-404.json'),
    `${JSON.stringify({ attachmentId, contentHash, route: '/companion/attachment-resource',
      statusCode: 404, error: 'missing_file' }, null, 2)}\n`);
}
