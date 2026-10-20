// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { CapacitorCompanionDatabaseOwner } from '../shared/platform/companion/runtime/capacitorCompanionDatabaseOwner';
import { createDisplayLibrary } from '../shared/platform/companion/sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner,
  initializeIosCompanionDatabase: () => { throw new Error('Use the isolated file fixture'); },
  closeIosCompanionDatabase: () => runtime.owner?.close()
}));

import { seedRemediationPerformanceFixture } from './remediationPerformanceFixture';
import { measureRemediationPerformance } from './remediationPerformanceProbe';

it('measures real scan contention, mixed persistence and batched detail reads on an isolated SQLite library', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'Remediation acceptance', now: '2026-10-19T00:00:00.000Z' });
    await library.owner.runWriter(seedRemediationPerformanceFixture);
    const phases: string[] = [];
    const result = await measureRemediationPerformance({ ...library, fullReads: library.fullDirectoryQueries },
      phase => phases.push(phase));
    expect(phases).toEqual(['attachment-scan', 'reading-settings', 'sync-details', 'external-lifecycle']);
    expect(result.externalLifecycle).toEqual({ hiddenRetained: true, rejoinRestored: true,
      retainedBeforeExpiry: true, purgedAtExpiry: true, activeProviderPreserved: true, noDeletionRecords: true });
    expect(result.scan).toMatchObject({ references: 1, scanDiscardedForWrite: true });
    expect(result.scan.queryCount).toBeLessThanOrEqual(131);
    expect(result.scan.scoreWaitAndWriteMs).toBeGreaterThan(0);
    expect(result.mixed).toMatchObject({ fullReads: 0, readingNodes: 2, snapshotMatches: true });
    expect(result.details).toMatchObject({ queryCount: 1, expandedNodes: 500, detailsMatch: true });
  } finally { await library.close(); }
}, 120000);
