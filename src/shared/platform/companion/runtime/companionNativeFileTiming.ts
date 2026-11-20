import { timeCompanionActivity, type CompanionActivityKind } from './companionActivityTiming';

const timedMethods: Record<string, CompanionActivityKind> = {
  resolveAttachmentResource: 'native.resolve-resource',
  writeImageAttachment: 'native.write-image',
  readRemoteImageResponse: 'native.read-remote-image'
};
const timingKey = 'executor_timing';

/** Times native file calls and keeps the host's executor measurement out of their result contracts. */
export function withNativeFileTiming<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get(target, property, receiver) {
      const kind = typeof property === 'string' && Object.hasOwn(timedMethods, property) ? timedMethods[property] : undefined;
      if (!kind) return Reflect.get(target, property, receiver);
      return (...args: unknown[]) => {
        let executor: { queueMs?: number; runMs?: number } = {};
        return timeCompanionActivity(kind, async () => {
          const method = Reflect.get(target, property, receiver) as (...values: unknown[]) => Promise<unknown>;
          const result = await method.apply(target, args);
          if (!result || typeof result !== 'object' || !(timingKey in result)) return result;
          const { [timingKey]: raw, ...rest } = result as Record<string, unknown>;
          executor = readExecutorTiming(raw);
          return rest;
        }, () => executor);
      };
    }
  });
}

function readExecutorTiming(value: unknown) {
  const timing = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const duration = (field: string) => typeof timing[field] === 'number' && Number.isSafeInteger(timing[field])
    && (timing[field] as number) >= 0 ? timing[field] as number : undefined;
  const queueMs = duration('queue_ms');
  const runMs = duration('run_ms');
  return queueMs === undefined || runMs === undefined ? {} : { queueMs, runMs };
}
