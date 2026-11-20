import {
  companionSandboxScenarios,
  type CompanionSandboxScenario,
  type CompanionSandboxScenarioStore
} from '../../src/shared/platform/companion/preview/companionSandboxScenarios';

export function createCompanionSandboxScenarioStore(): CompanionSandboxScenarioStore {
  const active = new Set<CompanionSandboxScenario>();
  const listeners = new Set<() => void>();
  return {
    isEnabled: scenario => active.has(scenario),
    setEnabled(scenario, enabled) {
      if (active.has(scenario) === enabled) return;
      if (enabled) active.add(scenario);
      else active.delete(scenario);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

export function attachCompanionSandboxScenarioControls(document: Document, frame: HTMLIFrameElement) {
  const chinese = document.defaultView?.navigator.language.toLowerCase().startsWith('zh');
  const panel = document.createElement('fieldset');
  panel.className = 'sandbox-scenarios';
  const legend = document.createElement('legend');
  legend.textContent = chinese ? '调试场景' : 'Debug scenarios';
  panel.append(legend);
  const apply = companionSandboxScenarios.map(scenario => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const update = () => frame.contentWindow?.__folioleSandboxScenarios?.setEnabled(scenario.id, box.checked);
    box.addEventListener('change', update);
    label.append(box, chinese ? scenario.zhHansLabel : scenario.label);
    panel.append(label);
    return update;
  });
  const applyAfterReload = () => apply.forEach(update => update());
  frame.addEventListener('load', applyAfterReload);
  (document.querySelector('.sandbox-stage') ?? document.body).append(panel);
  return () => {
    frame.removeEventListener('load', applyAfterReload);
    panel.remove();
  };
}
