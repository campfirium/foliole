type QueueEntry<T> = {
  reject(error: unknown): void;
  resolve(value: T): void;
  task(): Promise<T>;
};

const controlQueue: Array<QueueEntry<unknown>> = [];
const dataQueue: Array<QueueEntry<unknown>> = [];
let writerActive = false;

export function runCompanionSyncWriterTask<T>(task: () => Promise<T>): Promise<T> {
  return enqueue(dataQueue, task);
}

export function runCompanionSyncControlWriterTask<T>(task: () => Promise<T>): Promise<T> {
  return enqueue(controlQueue, task);
}

function enqueue<T>(queue: Array<QueueEntry<unknown>>, task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    queue.push({ reject, resolve, task } as QueueEntry<unknown>);
    runNext();
  });
}

function runNext() {
  if (writerActive) return;
  const entry = controlQueue.shift() ?? dataQueue.shift();
  if (!entry) return;
  writerActive = true;
  void Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
    writerActive = false;
    runNext();
  });
}
