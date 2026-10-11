import { Capacitor, registerPlugin } from '@capacitor/core';

import { runReadonlySnapshotProbe } from '../shared/platform/companion/runtime/readonlySnapshotProbe';

import { assertIdentity } from './capacityAcceptanceSafety';

export async function runReadonlySnapshotAcceptance(onPhase: (phase: string) => void = () => {}) {
  const app = registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App');
  onPhase('identity');
  const identity = await app.getInfo();
  const platform = Capacitor.getPlatform();
  assertIdentity(platform, identity.id);
  const result = await runReadonlySnapshotProbe(onPhase);
  return { status: 'passed', scenario: 'readonly-snapshot', platform,
    appId: identity.id, ...result, cleanup: true };
}

export function mountReadonlySnapshotAcceptance(root: HTMLElement) {
  root.className = 'flex flex-col gap-4 p-6 pt-[env(safe-area-inset-top)]';
  const button = document.createElement('button');
  button.className = 'mt-6 min-h-12';
  button.type = 'button';
  button.textContent = 'Run isolated snapshot probe';
  const result = document.createElement('textarea');
  result.readOnly = true;
  result.setAttribute('aria-label', 'Snapshot probe result');
  result.rows = 12;
  result.value = JSON.stringify({ status: 'ready' });
  root.replaceChildren(button, result);
  button.onclick = async () => {
    button.disabled = true;
    const onPhase = (phase: string) => { result.value = JSON.stringify({ status: 'running', phase }); };
    try { result.value = JSON.stringify(await runReadonlySnapshotAcceptance(onPhase)); }
    catch (error) { result.value = JSON.stringify({ status: 'failed', error: String(error) }); }
  };
}
