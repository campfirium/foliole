import { writeFile } from 'node:fs/promises';

export type ResponseSample = { sentAt: number; receivedAt: number; durationMs: number; error?: string };
export type WorkloadInterval = { startedAt: number; endedAt: number; durationMs: number; result: unknown };

function summarizeMeasurement(options: {
  targetSha: string; maximumResponseMs: number; maximumWorkloadMs: number;
  minimumOverlappingSamples: number;
}, workload: WorkloadInterval | undefined, workloadError: string | undefined,
samples: ResponseSample[]) {
  const overlapping = workload ? samples.filter((sample) =>
    sample.sentAt < workload.endedAt && sample.receivedAt > workload.startedAt) : [];
  const failures = [
    ...(workloadError ? [`workload: ${workloadError}`] : []),
    ...(workload && workload.durationMs > options.maximumWorkloadMs
      ? [`workload ${workload.durationMs}ms > ${options.maximumWorkloadMs}ms`] : []),
    ...(overlapping.length < options.minimumOverlappingSamples
      ? [`overlapping samples ${overlapping.length} < ${options.minimumOverlappingSamples}`] : []),
    ...overlapping.filter((sample) => sample.error || sample.durationMs > options.maximumResponseMs)
      .map((sample) => `response ${sample.durationMs}ms${sample.error ? `: ${sample.error}` : ''}`)
  ];
  return {
    targetSha: options.targetSha,
    limits: { maximumResponseMs: options.maximumResponseMs,
      maximumWorkloadMs: options.maximumWorkloadMs,
      minimumOverlappingSamples: options.minimumOverlappingSamples },
    workload, samples, overlappingSampleCount: overlapping.length,
    maximumObservedResponseMs: Math.max(0, ...overlapping.map((sample) => sample.durationMs)),
    failures
  };
}

export async function measureWorkloadResponsiveness(options: {
  startWorkload: () => Promise<WorkloadInterval>;
  waitUntilStarted: () => Promise<void>;
  probe: () => Promise<unknown>;
  evidencePath: string;
  targetSha: string;
  intervalMs: number;
  maximumResponseMs: number;
  minimumOverlappingSamples: number;
  maximumWorkloadMs: number;
}) {
  const samples: ResponseSample[] = [];
  const pending = new Set<Promise<void>>();
  let timer: NodeJS.Timeout | undefined;
  let workload: WorkloadInterval | undefined;
  let workloadError: string | undefined;
  const sendProbe = () => {
    const sentAt = Date.now();
    const request = options.probe().then(() => {
      const receivedAt = Date.now();
      samples.push({ sentAt, receivedAt, durationMs: receivedAt - sentAt });
    }, (error: unknown) => {
      const receivedAt = Date.now();
      samples.push({ sentAt, receivedAt, durationMs: receivedAt - sentAt, error: String(error) });
    });
    pending.add(request);
    void request.finally(() => pending.delete(request));
  };
  const running = options.startWorkload();
  try {
    await options.waitUntilStarted();
    sendProbe();
    timer = setInterval(sendProbe, options.intervalMs);
    workload = await running;
  } catch (error) {
    workloadError = String(error);
    await running.catch(() => undefined);
  } finally {
    if (timer) clearInterval(timer);
    await Promise.allSettled([...pending]);
  }
  const evidence = summarizeMeasurement(options, workload, workloadError, samples);
  await writeFile(options.evidencePath, JSON.stringify(evidence, null, 2));
  if (evidence.failures.length) throw new Error(evidence.failures.join('; '));
  return evidence;
}
