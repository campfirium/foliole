import { Capacitor, registerPlugin } from '@capacitor/core';

import { assertIdentity, requireValue } from './capacityAcceptanceSafety';
import { runRemediationPerformanceProbe } from './remediationPerformanceProbe';

export function mountRemediationPerformanceAcceptance(root: HTMLElement) {
  root.className = 'flex flex-col gap-4 p-6 pt-[env(safe-area-inset-top)]';
  const button = document.createElement('button');
  button.className = 'min-h-12';
  button.textContent = 'Run remediation measurements';
  button.dataset.testid = 'remediation-performance-start';
  const result = document.createElement('textarea');
  result.readOnly = true;
  result.setAttribute('aria-label', 'Remediation measurement result');
  result.dataset.testid = 'remediation-performance-result';
  const publish = (value: { status: string; [key: string]: unknown }) => {
    result.value = JSON.stringify(value);
    result.dataset.status = value.status;
    result.dataset.result = result.value;
  };
  root.replaceChildren(button, result);
  publish({ status: 'ready' });
  button.onclick = async () => {
    button.disabled = true;
    try {
      const platform = Capacitor.getPlatform();
      const identity = await registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App').getInfo();
      assertIdentity(platform, identity.id);
      requireValue(platform === 'android' || platform === 'ios', 'Native acceptance required');
      const measured = await runRemediationPerformanceProbe(platform, phase => publish({ status: 'running', phase }));
      publish({ status: 'passed', scenario: 'remediation-performance', appId: identity.id,
        platform, cleanup: true, ...measured });
    } catch (error) { publish({ status: 'failed', error: String(error) }); }
  };
}
