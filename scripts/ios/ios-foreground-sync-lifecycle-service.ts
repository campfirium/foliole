import { readFileSync } from 'node:fs';
import path from 'node:path';

export type ForegroundSyncLifecyclePhase =
  | 'endpoint-ready'
  | 'failed-resume'
  | 'recovered-resume'
  | 'restart'
  | 'resume-single-flight';

export function createIosForegroundSyncLifecycleObservations() {
  return {
    active_requests: 0,
    completed_requests: 0,
    failed_requests: 0,
    max_concurrency: 0,
    phase_requests: {} as Partial<Record<ForegroundSyncLifecyclePhase, number>>,
    request_count: 0,
    requests: [] as Array<{
      finished_at: string | null;
      phase: ForegroundSyncLifecyclePhase;
      started_at: string;
      status: 'failed' | 'passed' | 'running';
    }>
  };
}

type RoutedResponse = { body: string | Buffer; contentType: string; status?: number } | null;

export function createIosForegroundSyncLifecycleService(args: {
  artifactDir: string;
  observations: ReturnType<typeof createIosForegroundSyncLifecycleObservations>;
  route(request: { bodyText: string; method: string; url: string }): Promise<RoutedResponse>;
}) {
  return async (request: { bodyText: string; method: string; url: string }) => {
    if (request.method !== 'GET' || !request.url.startsWith('/companion/sync-pack?')) {
      return args.route(request);
    }
    const phase = readPhase(args.artifactDir);
    const observations = args.observations;
    observations.request_count += 1;
    observations.active_requests += 1;
    observations.max_concurrency = Math.max(observations.max_concurrency, observations.active_requests);
    observations.phase_requests[phase] = (observations.phase_requests[phase] ?? 0) + 1;
    const evidence = { finished_at: null, phase, started_at: new Date().toISOString(), status: 'running' as const };
    observations.requests.push(evidence);
    try {
      if (phase === 'resume-single-flight' || phase === 'recovered-resume') await delay(1_500);
      if (phase === 'failed-resume') {
        observations.failed_requests += 1;
        Object.assign(evidence, { finished_at: new Date().toISOString(), status: 'failed' });
        return {
          body: JSON.stringify({ error: 'foreground_sync_acceptance_failure' }),
          contentType: 'application/json',
          status: 503
        };
      }
      const response = await args.route(request);
      observations.completed_requests += 1;
      Object.assign(evidence, { finished_at: new Date().toISOString(), status: 'passed' });
      return response;
    } finally {
      observations.active_requests -= 1;
    }
  };
}

function readPhase(artifactDir: string) {
  const value = JSON.parse(readFileSync(path.join(artifactDir, 'lifecycle-control.json'), 'utf8')) as {
    phase?: ForegroundSyncLifecyclePhase;
  };
  if (!value.phase) throw new Error('iOS foreground sync lifecycle phase is missing.');
  return value.phase;
}

function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
