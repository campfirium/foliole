export type DesktopTaskPriority = 'foreground' | 'startup' | 'background';
export type DesktopTaskRunLocation = 'main' | 'utility';
export type DesktopTaskDuplicatePolicy = 'coalesce' | 'enqueue' | 'skip';

export interface DesktopTaskProgress {
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

export interface DesktopTaskDefinition {
  cancellable?: boolean;
  concurrencyKey: string;
  duplicatePolicy?: DesktopTaskDuplicatePolicy;
  failureLabel?: string;
  id: string;
  label: string;
  priority: DesktopTaskPriority;
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
