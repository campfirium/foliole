import { createHash } from 'node:crypto';

export function windowsDevFailure(message, exitCode, stage) {
  return Object.assign(new Error(message), { exitCode, stage });
}

export function verifyWindowsDevSigningIdentity(paths, fsApi) {
  if (!fsApi.existsSync(paths.signingManifest) || !fsApi.existsSync(paths.signingKeystore)) {
    throw windowsDevFailure('Android signing identity is incomplete', 64, 'signing');
  }
  const manifest = parseJson(fsApi.readFileSync(paths.signingManifest, 'utf8'), 'signing identity');
  const expectedPath = fsApi.realpathSync.native(paths.signingKeystore);
  if (manifest.schemaVersion !== 1 || typeof manifest.keystorePath !== 'string'
      || manifest.keystorePath.toLowerCase() !== expectedPath.toLowerCase()
      || !/^[0-9a-f]{64}$/u.test(manifest.sha256)) {
    throw windowsDevFailure('Android signing identity contract is invalid', 64, 'signing');
  }
  const digest = createHash('sha256').update(fsApi.readFileSync(paths.signingKeystore)).digest('hex');
  if (digest !== manifest.sha256) {
    throw windowsDevFailure('Android signing keystore hash changed', 64, 'signing');
  }
  return manifest;
}

export function formatWindowsDevFailure(summary) {
  const stage = String(summary.failureStage || 'entry').replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 48);
  const message = String(summary.message || 'unknown failure').replace(/[\r\n]+/gu, ' ').slice(0, 500);
  return `[windows-dev-action] failure stage=${stage || 'entry'} message=${message}`;
}

function parseJson(text, label) {
  try { return JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch { throw windowsDevFailure(`${label} is not valid JSON`, 64, 'preflight'); }
}
