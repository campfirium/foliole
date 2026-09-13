import { waitForDesktopTaskPressureRelief } from './desktopTaskPressure.js';
import { shouldWriteDesktopTaskProgressEvent } from './desktopTaskProgressEvents.js';
import {
  createQueuedDesktopTask,
  isDesktopTaskAbortError,
  type QueuedDesktopTask
} from './desktopTaskQueue.js';
import { hasDesktopTaskResourceCapacity, usesDesktopTaskResource } from './desktopTaskResources.js';
import type {
  DesktopTaskContext,
  DesktopTaskDefinition,
  DesktopTaskHandle,
  DesktopTaskPriority,
  DesktopTaskResource
} from './desktopTaskTypes.js';
import { appendBootEvent } from './ipc/boot.js';

interface DesktopTaskSchedulerArgs {
  appendEvent?: typeof appendBootEvent;
  now?: () => number;
}

const PRIORITY_ORDER: Record<DesktopTaskPriority, number> = {
  foreground: 0,
  startup: 1,
  background: 2
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DesktopTaskScheduler {
  private readonly appendEvent: typeof appendBootEvent;
  private readonly now: () => number;
  private pending: QueuedDesktopTask[] = [];
  private pausedResources = new Set<DesktopTaskResource>();
  private running = new Set<QueuedDesktopTask>();
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
    const task = createQueuedDesktopTask(definition, ++this.sequence, this.now());
    this.pending.push(task);
    void this.writeEvent('desktop_task_submitted', definition);
    this.scheduleTick();
    return this.createHandle(task);
  }

  hasHigherPriorityPending(priority: DesktopTaskPriority) {
    return this.pending.some((task) => PRIORITY_ORDER[task.definition.priority] < PRIORITY_ORDER[priority]);
  }

  notifyPressureChanged() {
    this.scheduleTick();
  }

  async pauseResource(resource: DesktopTaskResource) {
    this.pausedResources.add(resource);
    const cancelledPending = this.pending.filter((task) => usesDesktopTaskResource(task.definition, resource));
    this.pending = this.pending.filter((task) => !usesDesktopTaskResource(task.definition, resource));
    for (const task of cancelledPending) {
      task.controller.abort();
      task.state = 'finished';
      task.resolve(undefined);
      void this.writeEvent('desktop_task_cancelled', task.definition);
    }
    const active = [...this.running].filter((task) => usesDesktopTaskResource(task.definition, resource));
    active.forEach((task) => task.controller.abort());
    await Promise.allSettled(active.map((task) => task.promise));
    return () => {
      this.pausedResources.delete(resource);
      this.scheduleTick();
    };
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
    return [...this.running, ...this.pending].find(
      (task): task is QueuedDesktopTask =>
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
    while (this.pending.length > 0) {
      const task = this.takeNextRunnableTask();
      if (!task) return;
      this.running.add(task);
      void this.runTask(task);
    }
  }

  private async runTask(task: QueuedDesktopTask) {
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
      this.running.delete(task);
      this.scheduleTick();
    }
  }

  private takeNextRunnableTask() {
    this.pending.sort((left, right) => {
      const priority = this.effectivePriority(left) - this.effectivePriority(right);
      return priority || left.sequence - right.sequence;
    });
    const runningDefinitions = [...this.running].map((task) => task.definition);
    const index = this.pending.findIndex((task) =>
      !task.definition.resources?.some((claim) => this.pausedResources.has(claim.resource)) &&
      hasDesktopTaskResourceCapacity(task.definition, runningDefinitions)
    );
    return index < 0 ? null : this.pending.splice(index, 1)[0] ?? null;
  }

  private effectivePriority(task: QueuedDesktopTask) {
    const base = PRIORITY_ORDER[task.definition.priority];
    const maxWaitMs = task.definition.maxWaitMs;
    if (!maxWaitMs || maxWaitMs <= 0) return base;
    const promotions = Math.floor((this.now() - task.submittedAt) / maxWaitMs);
    return Math.max(0, base - promotions);
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
        const isHeavyMaintenance = task.definition.priority !== 'foreground' &&
          task.definition.resources?.some((claim) => claim.resource === 'cpu-heavy');
        if (isHeavyMaintenance) await waitForDesktopTaskPressureRelief(task.controller.signal);
        await delay(0);
      }
    };
  }

  private async handleTaskError(task: QueuedDesktopTask, error: unknown) {
    if (task.controller.signal.aborted || isDesktopTaskAbortError(error)) {
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
      metadata: definition.metadata ?? null,
      priority: definition.priority,
      resources: definition.resources ?? null,
      runOn: definition.runOn ?? 'main',
      source: definition.source
    }).catch((error) => {
      console.error('[desktop-task] boot event failed', error);
    });
  }
}

export const desktopTaskScheduler = new DesktopTaskScheduler();
