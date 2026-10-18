import { Capacitor, registerPlugin } from '@capacitor/core';

import { runAttachmentBlockNativeProbe } from '../shared/platform/companion/runtime/attachmentBlockNativeProbe';

import { assertIdentity, requireValue } from './capacityAcceptanceSafety';
import { runRequestSnapshotProbe } from './requestSnapshotProbe';

export function mountRequestSnapshotAcceptance(root: HTMLElement) {
  const button = document.createElement('button');
  button.textContent = 'Run request snapshot';
  button.dataset.testid = 'request-snapshot-start';
  const result = document.createElement('textarea');
  result.readOnly = true;
  result.rows = 12;
  result.setAttribute('aria-label', 'Request snapshot result');
  result.dataset.testid = 'request-snapshot-result';
  const publish = (value: { status: string; phase?: string; [key: string]: unknown }) => {
    result.value = JSON.stringify(value);
    result.dataset.status = value.status;
    result.dataset.phase = value.phase ?? '';
    result.dataset.result = result.value;
  };
  root.className = 'flex flex-col gap-4 p-6 pt-[env(safe-area-inset-top)]';
  root.replaceChildren(button, result);
  publish({ status: 'ready' });
  button.onclick = async () => {
    button.disabled = true;
    const phases: string[] = [];
    try {
      const platform = Capacitor.getPlatform();
      const identity = await registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App').getInfo();
      assertIdentity(platform, identity.id);
      requireValue(platform === 'android' || platform === 'ios', 'Native acceptance required');
      const outcome = await runRequestSnapshotProbe(platform, phase => {
        phases.push(phase);
        publish({ status: 'running', phase });
      });
      const attachment = await runAttachmentBlockNativeProbe(platform);
      const endpoint = import.meta.env.VITE_FOLIOLE_ATTACHMENT_BENCHMARK_URL;
      const throughput = endpoint ? await (await import('../shared/platform/companion/runtime/attachmentThroughputNativeProbe'))
        .runAttachmentThroughputNativeProbe(platform, endpoint,
          detail => publish({ status: 'running', phase: 'throughput', detail })) : undefined;
      publish({ status: 'passed', scenario: 'request-snapshot', appId: identity.id, platform,
        cleanup: true, ...outcome, attachment, throughput });
    } catch (error) { publish({ status: 'failed', phases, error: String(error) }); }
  };
}
