import type { ReminderRule } from './reminderRule.js';

export const DEFAULT_REMINDER_PRESETS = [
  { preset: 'seedling', message: '🌱', trigger: { kind: 'daily', time: '20:00' }, destination: 'flow', enabled: false },
  { preset: 'coffee', message: '☕', trigger: { kind: 'foreground', minutes: 20 }, enabled: false }
] as const satisfies readonly Pick<ReminderRule, 'preset' | 'message' | 'trigger' | 'destination' | 'enabled'>[];
