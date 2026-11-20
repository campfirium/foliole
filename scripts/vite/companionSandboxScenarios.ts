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

export function attachCompanionSandboxScenarioControls(document: Document, frame: HTMLIFrameElement, statusBar: HTMLElement) {
  const chinese = document.defaultView?.navigator.language.toLowerCase().startsWith('zh');
  const title = chinese ? '调试场景' : 'Debug scenarios';
  const menu = document.createElement('details');
  menu.className = 'sandbox-scenarios';
  const trigger = document.createElement('summary');
  trigger.setAttribute('aria-label', title);
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⋯';
  trigger.append(icon);
  const items = document.createElement('div');
  items.className = 'sandbox-scenario-items';
  const heading = document.createElement('h2');
  heading.textContent = title;
  items.append(heading);
  menu.append(trigger, items);

  const apply = companionSandboxScenarios.map(scenario => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const update = () => frame.contentWindow?.__folioleSandboxScenarios?.setEnabled(scenario.id, box.checked);
    box.addEventListener('change', () => {
      update();
      trigger.classList.toggle('is-active', Boolean(items.querySelector('input:checked')));
      trigger.focus();
      menu.open = false;
    });
    label.append(chinese ? scenario.zhHansLabel : scenario.label, box);
    items.append(label);
    return update;
  });
  const applyAfterReload = () => apply.forEach(update => update());
  const dismissOutside = (event: PointerEvent) => {
    if (!event.composedPath().includes(menu)) menu.open = false;
  };
  const dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    trigger.focus();
  };
  frame.addEventListener('load', applyAfterReload);
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('keydown', dismissOnEscape);
  for (const decoration of statusBar.children) decoration.setAttribute('aria-hidden', 'true');
  statusBar.removeAttribute('aria-hidden');
  statusBar.append(menu);
  return () => {
    frame.removeEventListener('load', applyAfterReload);
    document.removeEventListener('pointerdown', dismissOutside);
    document.removeEventListener('keydown', dismissOnEscape);
    menu.remove();
  };
}
