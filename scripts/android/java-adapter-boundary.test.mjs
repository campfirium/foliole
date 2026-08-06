// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  REMOVED_BUSINESS_FORKS,
  classifiedFiles,
  classificationEntries,
  inspectJavaAdapterBoundarySource
} from './java-adapter-boundary-rules.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android');

function productionJavaFiles() {
  return fs.readdirSync(JAVA_ROOT)
    .filter((entry) => entry.endsWith('.java'))
    .sort();
}

function duplicateClassifications() {
  const counts = new Map();
  for (const file of classifiedFiles()) counts.set(file, (counts.get(file) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([file]) => file);
}

function mainActivitySource() {
  return fs.readFileSync(path.join(JAVA_ROOT, 'MainActivity.java'), 'utf8');
}

function bootstrapStateSource() {
  return fs.readFileSync(path.join(JAVA_ROOT, 'FolioleCompanionBootstrapState.java'), 'utf8');
}

describe('Android Java adapter boundary', () => {
  it('documents a concrete host responsibility for every classification bucket', () => {
    expect(classificationEntries().map(({ kind, responsibility, files }) => ({
      kind,
      hasResponsibility: responsibility.length > 20,
      fileCount: files.length
    }))).toEqual([
      { kind: 'asset_support', hasResponsibility: true, fileCount: 4 },
      { kind: 'bridge_contract_metadata', hasResponsibility: true, fileCount: 9 },
      { kind: 'bridge_plugin_adapter', hasResponsibility: true, fileCount: 7 },
      { kind: 'host_platform_adapter', hasResponsibility: true, fileCount: 22 },
      { kind: 'isolated_pack_sqlite', hasResponsibility: true, fileCount: 2 }
    ]);
  });

  it('keeps every production Java class explicitly classified by adapter responsibility', () => {
    expect(duplicateClassifications()).toEqual([]);
    expect(productionJavaFiles()).toEqual(classifiedFiles());
  });

  it('keeps removed Android business-rule forks out of the production host', () => {
    const files = productionJavaFiles();
    expect(files.filter((file) => REMOVED_BUSINESS_FORKS.includes(file))).toEqual([]);
  });

  it('registers the packaged Capacitor SQLite plugin used by shared sync-pack apply', () => {
    expect(mainActivitySource()).toContain(
      'import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;'
    );
    expect(mainActivitySource()).toContain('registerPlugin(CapacitorSQLitePlugin.class);');
  });

  it('preserves the nullable database path until the shared SQLite owner opens it', () => {
    expect(bootstrapStateSource()).toContain('databasePath == null ? JSONObject.NULL : databasePath');
  });

  it('reloads bundled companion assets only when the packaged index signature changes', () => {
    const source = mainActivitySource();
    expect(source).toContain('getAssets().open("public/index.html")');
    expect(source).toContain('shouldRefreshWebAssets(webAssetSignature)');
    expect(source).toContain('webView.clearCache(true)');
    expect(source).toContain('/?foliole-app-assets=" + webAssetSignature');
  });

  it('blocks obvious sync conflict, review scheduling, and schema authoring rules in Java', () => {
    const matches = productionJavaFiles().flatMap((file) => {
      const source = fs.readFileSync(path.join(JAVA_ROOT, file), 'utf8');
      return inspectJavaAdapterBoundarySource(file, source);
    });

    expect(matches).toEqual([]);
  });

});
