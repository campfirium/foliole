import {
  shouldWriteDesktopTaskProgressEvent,
  type DesktopTaskProgressEventState
} from './desktopTaskProgressEvents.js';
import type {
  DesktopTaskContext,
  DesktopTaskDefinition,
  DesktopTaskHandle,
  DesktopTaskPriority
} from './desktopTaskTypes.js';
import { appendBootEvent } from './ipc/boot.js';

interface QueuedDesktopTask {
  attempt: number;
  controller: AbortController;
  definition: DesktopTaskDefinition;
  lastProgressEvent: DesktopTaskProgressEventState | null;
  promise: Promise<unknown>;
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  sequence: number;
  state: 'pending' | 'running' | 'finished';
}

interface DesktopTaskSchedulerArgs {
  appendEvent?: typeof appendBootEvent;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
}

const PRIORITY_ORDER: Record<DesktopTaskPriority, number> = {
  foreground: 0,
  startup: 1,
  background: 2
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createDeferredTask(definition: DesktopTaskDefinition, sequence: number): QueuedDesktopTask {
  let resolveTask: (value: unknown) => void = () => {};
  let rejectTask: (error: unknown) => void = () => {};
  const promise = new Promise<unknown>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  return {
    attempt: 1,
    controller: new AbortController(),
    definition,
    lastProgressEvent: null,
    promise,
    reject: rejectTask,
    resolve: resolveTask,
    sequence,
    state: 'pending'
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError');
}

export class DesktopTaskScheduler {
  private readonly appendEvent: typeof appendBootEvent;
  private readonly now: () => number;
  private pending: QueuedDesktopTask[] = [];
  private running: QueuedDesktopTask | null = null;
  private sequence = 0;
  private tickScheduled = false;

  constructor(args: DesktopTaskSchedulerArgs = {}) {
    this.appendEvent = args.appendEvent ?? appendBootEvent;
    this.now = args.now ?? Date.now;
  }

  submit(definition: DesktopTaskDefinition): DesktopTaskHandle {
    const duplicate = this.findDuplicate(definition);
    if (duplicate && definition.duplicatePolicy !== 'enqueue') {
      if (definition.duplicatePolicy === 'skip') {
        void this.writeEvent('desktop_task_skipped', definition);
      }
      return this.createHandle(duplicate);
    }
    const task = createDeferredTask(definition, ++this.sequence);
    this.pending.push(task);
    void this.writeEvent('desktop_task_submitted', definition);
    this.scheduleTick();
    return this.createHandle(task);
  }

  hasHigherPriorityPending(priority: DesktopTaskPriority) {
    return this.pending.some((task) => PRIORITY_ORDER[task.definition.priority] < PRIORITY_ORDER[priority]);
  }

  private createHandle(task: QueuedDesktopTask): DesktopTaskHandle {
    return {
      cancel: () => {
        if (task.definition.cancellable) {
          task.controller.abort();
        }
      },
      id: task.definition.id,
      promise: task.promise
    };
  }

  private findDuplicate(definition: DesktopTaskDefinition) {
    return [this.running, ...this.pending].find(
      (task): task is QueuedDesktopTask =>
        task !== null &&
        task.state !== 'finished' &&
        (task.definition.id === definition.id || task.definition.concurrencyKey === definition.concurrencyKey)
    );
  }

  private scheduleTick(delayMs = 0) {
    if (this.tickScheduled) {
      return;
    }
    this.tickScheduled = true;
    setTimeout(() => {
      this.tickScheduled = false;
      void this.runNext();
    }, delayMs);
  }

  private async runNext() {
    if (this.running || this.pending.length === 0) {
      return;
    }
    const task = this.takeNextTask();
    if (!task) {
      return;
    }
    this.running = task;
    task.state = 'running';
    const startedAt = this.now();
    await this.writeEvent('desktop_task_started', task.definition);
    try {
      const value = await task.definition.run(this.createContext(task));
      task.state = 'finished';
      task.resolve(value);
      await this.writeEvent('desktop_task_completed', task.definition, { durationMs: this.now() - startedAt });
    } catch (error) {
      await this.handleTaskError(task, error);
    } finally {
      if (this.running === task) {
        this.running = null;
      }
      this.scheduleTick();
    }
  }

  private takeNextTask() {
    this.pending.sort((left, right) => {
      const priority = PRIORITY_ORDER[left.definition.priority] - PRIORITY_ORDER[right.definition.priority];
      return priority || left.sequence - right.sequence;
    });
    return this.pending.shift() ?? null;
  }

  private createContext(task: QueuedDesktopTask): DesktopTaskContext {
    return {
      hasHigherPriorityPending: () => this.hasHigherPriorityPending(task.definition.priority),
      logger: {
        error: (message, error) => console.error(message, error),
        info: (message, payload) => console.info(message, payload)
      },
      progress: (progress) => {
        const decision = shouldWriteDesktopTaskProgressEvent({
          now: this.now(),
          previous: task.lastProgressEvent,
          progress: { ...progress }
        });
        if (decision.shouldWrite) {
          task.lastProgressEvent = decision.nextState;
          void this.writeEvent('desktop_task_progress', task.definition, { ...progress });
        }
      },
      signal: task.controller.signal,
      yieldIfNeeded: async () => {
        if (task.controller.signal.aborted) {
          throw new DOMException('AbortError', 'AbortError');
        }
        await delay(0);
      }
    };
  }

  private async handleTaskError(task: QueuedDesktopTask, error: unknown) {
    if (task.controller.signal.aborted || isAbortError(error)) {
      task.state = 'finished';
      task.resolve(undefined);
      await this.writeEvent('desktop_task_cancelled', task.definition);
      return;
    }
    const maxAttempts = task.definition.retry?.attempts ?? 1;
    if (task.attempt < maxAttempts) {
      task.attempt += 1;
      task.state = 'pending';
      this.pending.push(task);
      await this.writeEvent('desktop_task_retrying', task.definition, { attempt: task.attempt });
      this.scheduleTick(task.definition.retry?.delayMs ?? 0);
      return;
    }
    task.state = 'finished';
    task.reject(error);
    console.error(task.definition.failureLabel ?? `[desktop-task] ${task.definition.label} failed`, error);
    await this.writeEvent('desktop_task_failed', task.definition, {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  private async writeEvent(stage: string, definition: DesktopTaskDefinition, payload: Record<string, unknown> = {}) {
    await this.appendEvent(stage, {
      ...payload,
      concurrencyKey: definition.concurrencyKey,
      id: definition.id,
      label: definition.label,
      priority: definition.priority,
      runOn: definition.runOn ?? 'main',
      source: definition.source
    }).catch((error) => {
      console.error('[desktop-task] boot event failed', error);
    });
  }
}

export const desktopTaskScheduler = new DesktopTaskScheduler();
