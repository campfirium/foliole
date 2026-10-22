import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

/** Frozen libraries written by the tagged release; regenerate with scripts/database/generate-upgrade-scale-fixtures.mjs. */
const FIXTURE_ROOT = path.resolve('electron/database/fixtures/upgrade-scale');

export interface UpgradeScaleManifest {
  release: string;
  scales: { name: string; chapters: number; images: number }[];
}

export function readUpgradeScaleManifest() {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8')) as UpgradeScaleManifest;
}

function copyExpanded(source: string, destination: string) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry);
    if (statSync(from).isDirectory()) copyExpanded(from, path.join(destination, entry));
    else if (entry.endsWith('.db.gz')) writeFileSync(path.join(destination, entry.slice(0, -3)), gunzipSync(readFileSync(from)));
    else writeFileSync(path.join(destination, entry), readFileSync(from));
  }
}

/** Lay one old-release library out as `<documentsDir>/Foliole/...`, the way that release left it on disk. */
export function installUpgradeScaleLibrary(scale: string, documentsDir: string) {
  const manifest = readUpgradeScaleManifest();
  copyExpanded(path.join(FIXTURE_ROOT, `${manifest.release}-${scale}`, 'Documents'), documentsDir);
  return path.join(documentsDir, 'Foliole', 'Data', 'foliole.db');
}
