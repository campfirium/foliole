import { expect, it } from 'vitest';

import { isRunningInAppSandbox } from './appSandbox.js';

it('detects MAS and GitHub app sandbox runtimes independently of process.mas', () => {
  expect(isRunningInAppSandbox({ APP_SANDBOX_CONTAINER_ID: 'com.campfirium.foliole' })).toBe(true);
  expect(isRunningInAppSandbox({})).toBe(false);
});
