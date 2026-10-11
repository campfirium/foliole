import { Capacitor, registerPlugin } from '@capacitor/core';

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
    try {
      const platform = Capacitor.getPlatform();
      const identity = await registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App').getInfo();
      assertIdentity(platform, identity.id);
      requireValue(platform === 'android' || platform === 'ios', 'Native acceptance required');
      const outcome = await runRequestSnapshotProbe(platform, phase => publish({ status: 'running', phase }));
      publish({ status: 'passed', scenario: 'request-snapshot', appId: identity.id, platform, cleanup: true, ...outcome });
    } catch (error) { publish({ status: 'failed', error: String(error) }); }
  };
}
