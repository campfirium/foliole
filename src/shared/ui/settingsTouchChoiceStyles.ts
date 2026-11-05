export const settingsTouchChoiceGroupClassName = 'grid grid-flow-col auto-cols-fr gap-2';

export function settingsTouchChoiceButtonClassName(active: boolean) {
  return `min-h-11 min-w-0 rounded-md border px-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent ${active
    ? 'border-companion-accent bg-companion-accent-soft'
    : 'border-companion-divider active:bg-companion-subtle/80'}`;
}
