import {
  DESKTOP_MAINTENANCE_OPERATION_DEFINITIONS,
  type DesktopMaintenanceOperationName
} from './desktopOperationMaintenanceDefinitions.js';
import type {
  DesktopTaskCost,
  DesktopTaskPriority,
  DesktopTaskProgressCapability,
  DesktopTaskResourceClaim,
  DesktopTaskRunLocation,
  DesktopTaskStartupEligibility
} from './desktopTaskTypes.js';

type DesktopCoreOperationName =
  | 'mirror-backfill'
  | 'mirror-incremental'
  | 'search-index-incremental'
  | 'search-index-rebuild';
export type DesktopOperationName = DesktopCoreOperationName | DesktopMaintenanceOperationName;

export interface DesktopOperationDefinition {
  blocksStartup: boolean;
  cancellable: boolean;
  coalescing: 'coalesce' | 'enqueue' | 'skip';
  completion: string;
  concurrencyKey: string;
  cost: DesktopTaskCost;
  evidence: string;
  label: string;
  maxWaitMs?: number;
  priority: DesktopTaskPriority;
  progress: DesktopTaskProgressCapability;
  recovery: string;
  resources: DesktopTaskResourceClaim[];
  runOn: DesktopTaskRunLocation;
  source: string;
  startupEligibility: DesktopTaskStartupEligibility;
  trigger: string;
  verification: string;
  workload: string;
}

const TOTAL_SLOT: DesktopTaskResourceClaim = { resource: 'total' };
const HEAVY_RESOURCES: DesktopTaskResourceClaim[] = [
  TOTAL_SLOT,
  { resource: 'library' },
  { resource: 'cpu-heavy' },
  { resource: 'main-database-write' }
];

const DESKTOP_CORE_OPERATION_DEFINITIONS: Record<DesktopCoreOperationName, DesktopOperationDefinition> = {
  'mirror-backfill': {
    blocksStartup: false,
    cancellable: true,
    coalescing: 'coalesce',
    completion: 'Every missing article mirror has a file and a persisted mirror record.',
    concurrencyKey: 'mirror-output',
    cost: 'heavy',
    evidence: 'Per-article body loading and worker rendering; startup only plans metadata.',
    label: 'Mirror output backfill',
    maxWaitMs: 300_000,
    priority: 'background',
    progress: 'incremental',
    recovery: 'Persisted mirror records make completed articles resumable after interruption.',
    resources: HEAVY_RESOURCES,
    runOn: 'utility',
    source: 'mirror-backfill',
    startupEligibility: 'startup-deferred',
    trigger: 'App-ready recovery when configured mirror files may be missing.',
    verification: 'No-op restart, missing-only rebuild, cancellation resume, and interactive-load latency.',
    workload: 'One article body and one rendered file per scheduling unit.'
  },
  'mirror-incremental': {
    blocksStartup: false,
    cancellable: true,
    coalescing: 'coalesce',
    completion: 'All article ids coalesced from the current edit burst have current mirror files.',
    concurrencyKey: 'mirror-output',
    cost: 'medium',
    evidence: 'Ten-second debounce, sixty-second ceiling, per-article worker rendering.',
    label: 'Mirror output update',
    maxWaitMs: 60_000,
    priority: 'startup',
    progress: 'incremental',
    recovery: 'Unfinished edits are rediscovered by missing backfill; committed records prevent repeats.',
    resources: HEAVY_RESOURCES,
    runOn: 'utility',
    source: 'mirror-incremental',
    startupEligibility: 'startup-deferred',
    trigger: 'A persisted article, child note, or containing folder changes.',
    verification: 'Burst coalescing, same-session completion, and no unrelated full-body scan.',
    workload: 'Only articles resolved from the coalesced changed node ids.'
  },
  'search-index-incremental': {
    blocksStartup: false,
    cancellable: true,
    coalescing: 'enqueue',
    completion: 'The persisted invalidation batch is processed or retains a failed state.',
    concurrencyKey: 'search-index-rebuild',
    cost: 'heavy',
    evidence: 'Existing worker-thread batch path with a 500-item unit.',
    label: 'Search index maintenance',
    maxWaitMs: 120_000,
    priority: 'startup',
    progress: 'incremental',
    recovery: 'Persisted invalidation rows remain the source of unfinished work.',
    resources: HEAVY_RESOURCES,
    runOn: 'utility',
    source: 'search-invalidation',
    startupEligibility: 'startup-deferred',
    trigger: 'Persisted content or PDF search invalidation, including restart recovery.',
    verification: 'Batch fairness, restart continuation, cancellation, and no duplicate rebuild.',
    workload: 'At most 500 persisted invalidations per worker invocation.'
  },
  'search-index-rebuild': {
    blocksStartup: false,
    cancellable: true,
    coalescing: 'enqueue',
    completion: 'Workspace and external search indexes report ready or failed for the requested strategy.',
    concurrencyKey: 'search-index-rebuild',
    cost: 'heavy',
    evidence: 'Workspace rebuild uses a worker; external cache follows the same bounded task.',
    label: 'Search index rebuild',
    priority: 'background',
    progress: 'bounded',
    recovery: 'Persisted rebuilding or failed status drives the existing recovery path.',
    resources: HEAVY_RESOURCES,
    runOn: 'utility',
    source: 'search-index-rebuild',
    startupEligibility: 'manual-only',
    trigger: 'Explicit strategy change or invalid sidecar recovery.',
    verification: 'Strategy coalescing, worker execution, status publication, and failure state.',
    workload: 'One full index strategy rebuild.'
  }
};

export const DESKTOP_OPERATION_DEFINITIONS: Record<DesktopOperationName, DesktopOperationDefinition> = {
  ...DESKTOP_CORE_OPERATION_DEFINITIONS,
  ...DESKTOP_MAINTENANCE_OPERATION_DEFINITIONS
};

export function listDesktopOperationDefinitions() {
  return Object.entries(DESKTOP_OPERATION_DEFINITIONS).map(([name, definition]) => ({ name, ...definition }));
}

export function renderDesktopOperationMarkdownTable() {
  const header = '| Operation | Trigger | Priority | Cost | Executor | Resources | Recovery |';
  const divider = '| --- | --- | --- | --- | --- | --- | --- |';
  const rows = listDesktopOperationDefinitions().map((definition) => [
    definition.name,
    definition.trigger,
    definition.priority,
    definition.cost,
    definition.runOn,
    definition.resources.map((claim) => claim.resource).join(', '),
    definition.recovery
  ].map((cell) => String(cell).replaceAll('|', '\\|')).join(' | '));
  return [header, divider, ...rows.map((row) => `| ${row} |`)].join('\n');
}
