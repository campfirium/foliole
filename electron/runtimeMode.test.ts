import { expect, it } from 'vitest';

import { resolveRuntimeMode } from './runtimeMode.js';

it('allows parallel instances when the runtime identity marks a sample sandbox launch', () => {
  expect(resolveRuntimeMode({ FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1' }).allowParallelInstance).toBe(true);
});
