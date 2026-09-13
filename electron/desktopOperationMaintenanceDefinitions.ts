import type { DesktopOperationDefinition } from './desktopOperationDefinitions.js';

export type DesktopMaintenanceOperationName =
  | 'automatic-backup'
  | 'database-integrity'
  | 'external-search-refresh'
  | 'keep-import'
  | 'legacy-webview-migration'
  | 'managed-inbox-import'
  | 'pdf-indexing'
  | 'readwise-api-import';

const total = { resource: 'total' as const };
const library = { resource: 'library' as const };
const databaseWrite = [total, library, { resource: 'main-database-write' as const }];
const base = {
  blocksStartup: false,
  cancellable: true,
  coalescing: 'coalesce' as const,
  progress: 'bounded' as const,
  runOn: 'main' as const,
  startupEligibility: 'startup-deferred' as const
};

export const DESKTOP_MAINTENANCE_OPERATION_DEFINITIONS: Record<
  DesktopMaintenanceOperationName,
  DesktopOperationDefinition
> = {
  'automatic-backup': {
    ...base,
    cancellable: false,
    completion: 'A due backup is durable before retention pruning completes.',
    concurrencyKey: 'automatic-backup',
    cost: 'medium',
    evidence: 'Existing cadence, safety snapshot settlement, compressed copy, and retention tests.',
    label: 'Automatic backup maintenance',
    priority: 'startup',
    recovery: 'An interrupted temporary copy is removed and the same cadence remains due.',
    resources: databaseWrite,
    source: 'automatic-backup',
    trigger: 'App-ready and configured cadence due.',
    verification: 'Due/no-op cadence, protected backup retention, and interrupted-copy cleanup.',
    workload: 'One due database backup followed by bounded retention cleanup.'
  },
  'database-integrity': {
    ...base,
    completion: 'The explicitly supplied database reports quick_check ok or a corruption error.',
    concurrencyKey: 'database-integrity',
    cost: 'heavy',
    evidence: 'SQLite quick_check is retained at restore, external acceptance, and recovery boundaries.',
    label: 'Database integrity check',
    priority: 'background',
    recovery: 'Failure preserves the source for recovery; it never clears or rebuilds automatically.',
    resources: [total, library, { resource: 'cpu-heavy' }],
    source: 'database-integrity',
    startupEligibility: 'manual-only',
    trigger: 'Restore, external database acceptance, or explicit suspected corruption.',
    verification: 'Routine startup skips it; restore rejects malformed input before replacement.',
    workload: 'One explicitly requested SQLite database.'
  },
  'external-search-refresh': {
    ...base,
    completion: 'Configured external document indexes record the attempted incremental refresh.',
    concurrencyKey: 'external-search-refresh',
    cost: 'heavy',
    evidence: 'Existing task context yields across external document batches.',
    label: 'External search refresh',
    maxWaitMs: 900_000,
    priority: 'background',
    recovery: 'Existing cache metadata and directory state determine the next incremental run.',
    resources: [total, library, { resource: 'cpu-heavy' }],
    source: 'external-search',
    trigger: 'Startup delay, interval, folder change, or eligible activity check.',
    verification: 'Coalescing, cancellation, directory changes, and no focus-triggered full rescan.',
    workload: 'Incremental configured-directory scan; full refresh remains low priority.'
  },
  'keep-import': {
    ...base,
    completion: 'The configured Keep source cycle commits all discovered changes once.',
    concurrencyKey: 'keep-import',
    cost: 'heavy',
    evidence: 'Existing per-source watcher state and prepared-import worker.',
    label: 'Keep import cycle',
    maxWaitMs: 300_000,
    priority: 'background',
    recovery: 'Filesystem state and import fingerprints rediscover incomplete work.',
    resources: databaseWrite,
    source: 'keep-import',
    trigger: 'Source startup/configuration or a coalesced watcher event.',
    verification: 'Per-source coalescing, restart discovery, duplicate suppression, and watcher release.',
    workload: 'One configured source cycle; preparation may use its existing worker.'
  },
  'legacy-webview-migration': {
    ...base,
    cancellable: false,
    completion: 'The one-time marker records migration or confirms no legacy directory exists.',
    concurrencyKey: 'legacy-webview-migration',
    cost: 'medium',
    evidence: 'Existing marker-gated one-time migration.',
    label: 'Legacy storage migration',
    priority: 'background',
    recovery: 'The marker and legacy directory remain the source of unfinished work.',
    resources: [total, library],
    source: 'legacy-storage',
    trigger: 'App-ready marker check.',
    verification: 'No-op after completion and restart continuation before marker commit.',
    workload: 'One legacy directory when the marker is absent.'
  },
  'managed-inbox-import': {
    ...base,
    completion: 'All configured inbox roots observed in the coalesced cycle are imported once.',
    concurrencyKey: 'managed-inbox-import',
    cost: 'heavy',
    evidence: 'Existing watcher coalescing, fingerprints, and persisted import results.',
    label: 'Managed inbox import cycle',
    maxWaitMs: 120_000,
    priority: 'background',
    recovery: 'Configured roots are incrementally checked after listeners resume.',
    resources: databaseWrite,
    source: 'managed-inbox',
    trigger: 'Startup/configuration scan or a coalesced new-file watcher event.',
    verification: 'Offline additions, watcher bursts, duplicate suppression, and renderer notification.',
    workload: 'One pass over configured roots; new-file events may override to startup priority.'
  },
  'pdf-indexing': {
    ...base,
    coalescing: 'enqueue',
    completion: 'The attachment pending row becomes indexed or failed.',
    concurrencyKey: 'pdf-indexing',
    cost: 'heavy',
    evidence: 'Existing attachment queue and durable pending/failed states.',
    label: 'PDF attachment indexing',
    maxWaitMs: 300_000,
    priority: 'background',
    recovery: 'Pending and failed attachment rows are resumed after app-ready.',
    resources: databaseWrite,
    source: 'pdf-indexing',
    trigger: 'Successful PDF import or restart recovery of pending/failed attachments.',
    verification: 'Same-session indexing, restart continuation, per-attachment dedupe, and failure state.',
    workload: 'One attachment per task.'
  },
  'readwise-api-import': {
    ...base,
    completion: 'The persisted tracked run records completion, interruption, or failure.',
    concurrencyKey: 'readwise-api-import',
    cost: 'heavy',
    evidence: 'Existing persisted cadence, candidate progress, and tracked-run lifecycle.',
    label: 'Readwise API automatic import',
    maxWaitMs: 900_000,
    priority: 'background',
    recovery: 'Tracked interrupted runs and candidate progress resume the same operation.',
    resources: databaseWrite,
    source: 'readwise-api',
    trigger: 'Configured cadence becomes due on the active host.',
    verification: 'Due-time persistence, restart recovery, host eligibility, and bounded retry lifecycle.',
    workload: 'One scheduled incremental or initial API run.'
  }
};
