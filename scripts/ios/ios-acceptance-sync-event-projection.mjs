import fs from 'node:fs';
import path from 'node:path';

const EVENT_KEYS = new Set([
  'device_identity_key', 'error', 'occurred_at', 'result', 'run_id', 'started_at', 'status',
  'trigger_reason'
]);
const PROJECTED_EVENT_KEYS = new Set([...EVENT_KEYS, 'message', 'summary']);
const PROJECTION_KEYS = new Set([
  'acceptance_document', 'build_identity', 'conflict_versions', 'container_identity',
  'events', 'inventory', 'overwrite_pending', 'state_inventory_rows'
]);
const VERSION_KEYS = new Set([
  'content_hash', 'forks', 'is_current', 'object_id', 'parents', 'version_id'
]);

function projectionFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}


export function loadProjection(root, buildIdentity, applicationId) {
  for (const file of projectionFiles(root)) {
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (value?.build_identity !== buildIdentity
        || value.container_identity !== applicationId
        || !Array.isArray(value.events)) continue;
    if (!Object.keys(value).every((key) => PROJECTION_KEYS.has(key))) {
      throw new Error('Fri acceptance projection exposed unsupported fields.');
    }
    if (!Array.isArray(value.conflict_versions)) {
      throw new Error('Fri acceptance conflict version projection is missing.');
    }
    for (const event of value.events) {
      if (!Object.keys(event).every((key) => PROJECTED_EVENT_KEYS.has(key))) {
        throw new Error('Fri sync event projection exposed unsupported fields.');
      }
    }
    for (const version of value.conflict_versions) {
      if (!Object.keys(version).every((key) => VERSION_KEYS.has(key))
          || !Array.isArray(version.parents) || !Array.isArray(version.forks)) {
        throw new Error('Fri conflict version projection exposed unsupported fields.');
      }
    }
    return { file, value: { build_identity: value.build_identity,
      container_identity: value.container_identity, conflict_versions: value.conflict_versions,
      events: value.events.map((event) => Object.fromEntries(
        Object.entries(event).filter(([key]) => EVENT_KEYS.has(key)))) } };
  }
  throw new Error('Fri acceptance sync event projection attachment is missing.');
}

export function resolveFriEvidenceRoot(result, fallbackRoot) {
  for (const line of [...result.lines].reverse()) {
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.classification === 'accepted' && typeof value.promoted === 'string') {
      return value.promoted;
    }
  }
  return fallbackRoot;
}

export function persistFriProjection(projection, evidenceRoot) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const file = path.join(evidenceRoot, 'projection.json');
  fs.writeFileSync(file, `${JSON.stringify(projection.value, null, 2)}\n`);
  return { file, value: projection.value };
}
