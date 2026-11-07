import { createHash } from 'node:crypto';

export function handlePrebuildPlayRequest(f, { request, response, route, body, send }) {
  const reply = value => { send(value); return true; };
  if (request.method === 'POST' && route === 'edits') {
    if (f.createResponse) { response.statusCode = f.createResponse.status; response.end(f.createResponse.body); return true; }
    const id = f.nextUploadEditId ?? String(++f.nextEdit);
    if (f.singleEditPerAccount) f.edits.clear();
    f.edits.add(id);
    if (f.loseCreate) { f.loseCreate = false; response.destroy(); return true; }
    return reply({ id });
  }
  const inventory = route.match(/^edits\/([^/:]+)(.*)$/u);
  if (!inventory) return false;
  if (request.method === 'DELETE') {
    f.edits.delete(decodeURIComponent(inventory[1]));
    if (f.loseDelete) { f.loseDelete = false; response.destroy(); return true; }
    return reply({});
  }
  if (inventory[2] === '/bundles') return reply({ bundles: f.uploadedBundle ? [f.uploadedBundle] : [{ versionCode: 3 }] });
  if (inventory[2] === '/apks') return reply({ apks: [{ versionCode: 8 }] });
  if (inventory[2] === '/tracks') return reply({ tracks: [{ track: 'beta', releases: [{ versionCodes: ['12'] }] }] });
  if (inventory[2] === '/tracks/beta' && request.method === 'GET') return reply({ track: 'beta', releases: [] });
  if (inventory[2] === '/tracks/beta' && request.method === 'PUT') { f.pendingRelease = body.releases[0]; return reply({}); }
  if (inventory[2].startsWith('/bundles?uploadType=')) {
    f.uploads = (f.uploads ?? 0) + 1;
    f.uploadedBundle = { versionCode: f.uploadCandidate.versionCode, sha256: createHash('sha256').update(body).digest('hex') };
    if (f.loseUpload) { f.loseUpload = false; response.destroy(); return true; }
    return reply(f.uploadedBundle);
  }
  if (inventory[2] === ':validate') return reply({});
  if (inventory[2].startsWith(':commit?')) {
    f.commits = (f.commits ?? 0) + 1;
    f.releases = [{ track: 'beta', releaseName: f.pendingRelease.name,
      activeArtifacts: [{ versionCode: f.uploadCandidate.versionCode }], releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' }];
    if (f.loseCommit) { f.loseCommit = false; response.destroy(); return true; }
    return reply({});
  }
  return false;
}
