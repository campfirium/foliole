export type DesktopTaskPriority = 'foreground' | 'startup' | 'background';
export type DesktopTaskRunLocation = 'main' | 'utility';
type DesktopTaskDuplicatePolicy = 'coalesce' | 'enqueue' | 'skip';
export type DesktopTaskCost = 'light' | 'medium' | 'heavy';
export type DesktopTaskProgressCapability = 'none' | 'bounded' | 'incremental';
export type DesktopTaskStartupEligibility = 'startup-allowed' | 'startup-deferred' | 'manual-only';
export type DesktopTaskResource = 'cpu-heavy' | 'library' | 'main-database-write' | 'total';

interface DesktopTaskProgress {
  completed?: number;
  message?: string;
  total?: number;
  unit?: string;
}

export interface DesktopTaskContext {
  hasHigherPriorityPending: () => boolean;
  logger: {
    error: (message: string, error?: unknown) => void;
    info: (message: string, payload?: unknown) => void;
  };
  progress: (progress: DesktopTaskProgress) => void;
  signal: AbortSignal;
  yieldIfNeeded: () => Promise<void>;
}

interface DesktopTaskAuditMetadata {
  cancellable: boolean;
  cost: DesktopTaskCost;
  progress: DesktopTaskProgressCapability;
  startupEligibility: DesktopTaskStartupEligibility;
}

export interface DesktopTaskResourceClaim {
  resource: DesktopTaskResource;
  units?: number;
}

export interface DesktopTaskDefinition {
  cancellable?: boolean;
  concurrencyKey: string;
  duplicatePolicy?: DesktopTaskDuplicatePolicy;
  failureLabel?: string;
  id: string;
  label: string;
  metadata?: DesktopTaskAuditMetadata;
  maxWaitMs?: number;
  priority: DesktopTaskPriority;
  resources?: DesktopTaskResourceClaim[];
  retry?: {
    attempts: number;
    delayMs?: number;
  };
  run: (context: DesktopTaskContext) => Promise<unknown> | unknown;
  runOn?: DesktopTaskRunLocation;
  source: string;
  startup?: boolean;
}

export interface DesktopTaskHandle {
  cancel: () => void;
  id: string;
  promise: Promise<unknown>;
}
