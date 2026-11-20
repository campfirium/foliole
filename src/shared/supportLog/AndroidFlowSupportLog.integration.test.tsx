import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';
import { timeCompanionAttachment } from '../platform/companion/runtime/companionAttachmentTiming';
import { beginAndroidFlowAction } from '../platform/supportLog/androidFlowTiming';
import { serializeSupportLog, stopSupportLog } from '../platform/supportLog/supportLog';

import { SupportLogPanel } from './SupportLogPanel';

const { shareSupportLog } = vi.hoisted(() => ({ shareSupportLog: vi.fn<(args: { text: string }) => Promise<{ status: string }>>(async () => ({ status: 'presented' })) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({ shareSupportLog })
}));

afterEach(() => {
  act(() => stopSupportLog());
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('exports only the current Android Flow recording through the existing share action', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
  vi.stubEnv('VITE_FOLIOLE_SOURCE_REVISION', 'a'.repeat(40));
  expect(beginAndroidFlowAction('soon')).toBeUndefined();
  const settings = renderWithLocalization(<SupportLogPanel mobile />);
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  const earlier = beginAndroidFlowAction('soon')!;
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  expect(JSON.parse(serializeSupportLog('android')!).androidFlow.events).toMatchObject([
    { operation: 1, action: 'soon', stage: 'action', status: 'start' }
  ]);
  expect(beginAndroidFlowAction('later')).toBeUndefined();

  fireEvent.click(screen.getByRole('button', { name: 'Record again' }));
  settings.unmount();
  earlier('write', 'done');
  const current = beginAndroidFlowAction('read')!;
  const invalidInput = 'text https://private.example /path node-id sync-token';
  current(invalidInput as never, 'done');
  current('receipt', invalidInput as never);
  current('queue-size', 'done', invalidInput as never);
  act(() => vi.advanceTimersByTime(219));
  current('body', 'done');
  await timeCompanionAttachment('file.inventory', async () => {
    vi.advanceTimersByTime(31);
  });
  act(() => vi.advanceTimersByTime(299_750));
  current('action', 'done');
  renderWithLocalization(<SupportLogPanel mobile />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export log' })));

  expect(shareSupportLog).toHaveBeenCalledOnce();
  const { text } = shareSupportLog.mock.calls[0]![0];
  expect(text).not.toMatch(/private|node-id|sync-token|\/path|https:/u);
  expect(JSON.parse(text)).toMatchObject({
    platform: 'android', appVersion: expect.any(String), elapsedMs: 300_000,
    androidFlow: { build: 'a'.repeat(40), events: [
      { operation: 1, action: 'read', stage: 'action', status: 'start', atMs: 0 },
      { operation: 1, action: 'read', stage: 'body', status: 'done', atMs: 219 }
    ], attachments: [{ kind: 'file.inventory', fromMs: 219, toMs: 250, status: 'done' }], omitted: 0 }
  });
  expect(JSON.parse(serializeSupportLog('desktop')!)).not.toHaveProperty('androidFlow');
  expect(beginAndroidFlowAction('read')).toBeUndefined();
});
