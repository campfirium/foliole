// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYNC_PROTOCOL_DEFINITIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'companion-sync-protocol-definitions.json'
);

const javaSource = (name) =>
  readFile(path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android', name), 'utf8');

describe('Android resource status metadata', () => {
  it('generates resource status values and status groups from the sync protocol asset', async () => {
    const definitions = JSON.parse(await readFile(SYNC_PROTOCOL_DEFINITIONS, 'utf8'));

    expect(definitions.resourceStatuses).toMatchObject({
      cached: 'cached',
      empty: 'empty',
      failed: 'failed',
      fetching: 'fetching',
      missing: 'missing',
      passthroughAvailabilityStatuses: ['fetching', 'failed'],
      ready: 'ready',
      visibleBodyStatuses: ['missing', 'empty', 'fetching', 'failed']
    });
  });

  it('keeps Android Java resource status consumers wired to generated metadata', async () => {
    const sources = await Promise.all([
      javaSource('FolioleCompanionReadableArticleQuery.java'),
      javaSource('FolioleCompanionExternalDocumentStore.java'),
      javaSource('FolioleCompanionWorkspaceNodeSnapshotBuilder.java'),
      javaSource('FolioleCompanionWorkspaceSnapshotExporter.java'),
      javaSource('FolioleCompanionContentBlobMissingStore.java'),
      javaSource('FolioleCompanionAttachmentResourceMissingStore.java'),
      javaSource('FolioleCompanionContentBlobStore.java'),
      javaSource('FolioleCompanionAttachmentResourceStore.java'),
      javaSource('FolioleCompanionSyncDiagnostics.java')
    ]);
    const combined = sources.join('\n');

    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, "passthroughAvailabilityStatuses")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, rules.getString("visibleBodyStatusGroup"))');
    expect(combined).not.toContain('"fetching".equals(availability)');
    expect(combined).not.toContain('"failed".equals(availability)');
    expect(combined).not.toContain('"cached".equals(availability)');
    expect(combined).not.toContain('result.put("availability", "cached")');
    expect(combined).not.toContain('result.put("status", "ready")');
  });
});
