import { expect, it } from 'vitest';

import type {
  NativeReadwiseApiRunLifecycle,
  NativeReadwiseApiScheduleStatus
} from '../../../lib/platform/nativeReadwiseApiImportContract';
import { translate } from '../../shared/localization/translations';

import { readwiseApiPhasePresentation, readwiseApiTaskPresentation } from './ReadwiseApiTaskStatus';

const PROGRESS = {
  completed_count: 4,
  failed_count: 0,
  pending_count: 6,
  total_count: 10,
  unexplained_failure_count: 0
};

function lifecycle(
  kind: NativeReadwiseApiRunLifecycle['kind'],
  progress: NativeReadwiseApiRunLifecycle['progress'] = PROGRESS
): NativeReadwiseApiRunLifecycle {
  return {
    error_reason: null,
    finished_at: null,
    kind,
    progress,
    queued_at: '2026-09-10T00:00:00.000Z',
    run_id: `${kind}-run`,
    stage: 'writing',
    started_at: '2026-09-10T00:00:01.000Z',
    status: 'running',
    trigger: 'manual'
  };
}

function status(active: 'initial' | 'routine' | null): NativeReadwiseApiScheduleStatus {
  return {
    cutover: {
      completed_count: 31,
      failed_count: 0,
      pending_count: 0,
      status: 'completed',
      total_count: 31,
      unexplained_failure_count: 0
    },
    eligibility: 'ready',
    initial_sync: {
      completed_count: active === 'initial' ? 4 : 31,
      failed_count: 0,
      lifecycle: active === 'initial' ? lifecycle('initial') : null,
      pending_count: active === 'initial' ? 6 : 0,
      status: active === 'initial' ? 'running' : 'completed',
      total_count: active === 'initial' ? 10 : 31,
      unexplained_failure_count: 0
    },
    routine_sync: {
      last_result: active ? null : {
        completed_at: '2026-09-10T00:00:00.000Z',
        error_stage: null,
        imported_count: 1,
        status: 'completed',
        trigger: 'scheduled'
      },
      lifecycle: active === 'routine' ? lifecycle('routine') : null,
      next_run_at: null
    }
  };
}

it.each(['initial', 'routine'] as const)('projects %s worker progress through the same copy', (kind) => {
  expect(readwiseApiTaskPresentation(status(kind), translate.bind(null, 'en'))).toEqual({
    actionLabel: 'Sync',
    loadingLabel: 'Sync',
    running: true
  });
  expect(readwiseApiPhasePresentation(status(kind), translate.bind(null, 'en'))).toEqual({
    failed: false,
    text: 'Syncing'
  });
});

it('shows no historical task summary after a worker finishes', () => {
  expect(readwiseApiTaskPresentation(status(null), translate.bind(null, 'en'))).toEqual({
    actionLabel: 'Sync',
    loadingLabel: 'Sync',
    running: false
  });
});

it('does not infer progress before the owned worker establishes a total', () => {
  const snapshot = status('initial');
  snapshot.initial_sync.lifecycle = lifecycle('initial', null);
  expect(readwiseApiTaskPresentation(snapshot, translate.bind(null, 'en')).loadingLabel).toBe('Sync');
});

it('shows indexing while a normal sync is still building its Readwise index', () => {
  const snapshot = status('routine');
  snapshot.routine_sync.lifecycle = { ...lifecycle('routine', null), stage: 'fetching' };
  expect(readwiseApiPhasePresentation(snapshot, translate.bind(null, 'en'))).toEqual({
    failed: false,
    text: 'Indexing'
  });
});

it('keeps the failed indexing stage and its durable reason without numeric progress', () => {
  const snapshot = status('initial');
  snapshot.initial_sync.lifecycle = {
    ...lifecycle('initial'), error_reason: 'rate_limited', stage: 'fetching', status: 'failed'
  };
  expect(readwiseApiPhasePresentation(snapshot, translate.bind(null, 'en'))).toEqual({
    failed: true,
    text: 'Indexing failed · Readwise rate limit reached'
  });
});
