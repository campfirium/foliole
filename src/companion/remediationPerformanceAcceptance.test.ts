import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ platform: 'ios', appId: 'com.campfirium.foliole.ios.dev', run: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => runtime.platform },
  registerPlugin: () => ({ getInfo: async () => ({ id: runtime.appId }) })
}));
vi.mock('./remediationPerformanceProbe', () => ({ runRemediationPerformanceProbe: runtime.run }));

import { mountRemediationPerformanceAcceptance } from './remediationPerformanceAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.run.mockResolvedValue({ externalLifecycle: { hiddenRetained: true } });
});

it.each([
  ['ios', 'com.campfirium.foliole.ios.dev'],
  ['android', 'com.campfirium.foliole.android.acceptance']
])('runs the fixed %s acceptance identity with its actual host', async (platform, appId) => {
  runtime.platform = platform;
  runtime.appId = appId;
  const root = document.createElement('div');
  mountRemediationPerformanceAcceptance(root);
  root.querySelector('button')!.click();
  const result = root.querySelector('textarea')!;
  await vi.waitFor(() => expect(result.dataset.status).toBe('passed'));
  expect(runtime.run).toHaveBeenCalledOnce();
  expect(JSON.parse(result.value)).toMatchObject({ platform, appId, cleanup: true });
});

it.each([
  ['ios', 'com.campfirium.foliole.ios'],
  ['android', 'com.campfirium.foliole.android'],
  ['web', 'com.campfirium.foliole.ios.dev']
])('rejects %s product or unsupported identity before opening a fixture', async (platform, appId) => {
  runtime.platform = platform;
  runtime.appId = appId;
  const root = document.createElement('div');
  mountRemediationPerformanceAcceptance(root);
  root.querySelector('button')!.click();
  await vi.waitFor(() => expect(root.querySelector('textarea')!.dataset.status).toBe('failed'));
  expect(runtime.run).not.toHaveBeenCalled();
});
